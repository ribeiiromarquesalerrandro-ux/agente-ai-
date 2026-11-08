import { createHash } from "node:crypto";
import { getYouTubeAssetById, getYouTubeConnectionWithCredentials, updateYouTubeAsset } from "../db";
import { storageGetSignedUrl } from "../storage";
import { decryptYouTubeToken, encryptYouTubeToken } from "./security";
import { isYouTubePublishingEnabled } from "./oauth";
import { saveYouTubeConnection } from "../db";

type AccessToken = { accessToken: string; expiresIn: number };

async function refreshAccessToken(userId: number): Promise<AccessToken> {
  const connection = await getYouTubeConnectionWithCredentials(userId);
  if (!connection) throw new Error("YouTube channel is not connected.");
  const refreshToken = decryptYouTubeToken(connection.encryptedRefreshToken);
  const clientId = process.env.YOUTUBE_CLIENT_ID ?? "";
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret) throw new Error("YouTube OAuth credentials are not configured.");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Google access-token refresh failed with HTTP ${response.status}.`);
  const data = await response.json() as { access_token?: string; expires_in?: number; refresh_token?: string; scope?: string };
  if (!data.access_token || !data.expires_in) throw new Error("Google returned an incomplete refreshed token.");
  if (data.refresh_token) {
    await saveYouTubeConnection({
      userId,
      channelId: connection.channelId,
      channelTitle: connection.channelTitle,
      encryptedRefreshToken: encryptYouTubeToken(data.refresh_token),
      grantedScopes: data.scope ?? connection.grantedScopes,
    });
  }
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

async function youtubeGet<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`https://www.googleapis.com/youtube/v3/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`YouTube Data API request failed with HTTP ${response.status}.`);
  return response.json() as Promise<T>;
}

export async function getYouTubeChannelSummary(userId: number) {
  const { accessToken } = await refreshAccessToken(userId);
  const data = await youtubeGet<{
    items?: Array<{ id: string; snippet?: { title?: string }; statistics?: {
      viewCount?: string; subscriberCount?: string; videoCount?: string;
    } }>;
  }>("channels?part=snippet%2Cstatistics&mine=true", accessToken);
  const channel = data.items?.[0];
  if (!channel) throw new Error("No accessible YouTube channel was returned.");
  return {
    channelId: channel.id,
    channelTitle: channel.snippet?.title ?? "YouTube channel",
    views: Number(channel.statistics?.viewCount ?? 0),
    subscribers: Number(channel.statistics?.subscriberCount ?? 0),
    videos: Number(channel.statistics?.videoCount ?? 0),
  };
}

export async function getYouTubeRecentVideos(userId: number, maxResults = 10) {
  const { accessToken } = await refreshAccessToken(userId);
  const safeMaxResults = Math.max(1, Math.min(25, Math.floor(maxResults)));
  const search = await youtubeGet<{
    items?: Array<{ id?: { videoId?: string }; snippet?: {
      title?: string; publishedAt?: string; thumbnails?: { medium?: { url?: string } };
    } }>;
  }>(`search?part=snippet&forMine=true&type=video&order=date&maxResults=${safeMaxResults}`, accessToken);
  return (search.items ?? []).flatMap((item) => item.id?.videoId ? [{
    videoId: item.id.videoId,
    title: item.snippet?.title ?? "Untitled",
    publishedAt: item.snippet?.publishedAt ?? null,
    thumbnailUrl: item.snippet?.thumbnails?.medium?.url ?? null,
    url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
  }] : []);
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export async function getYouTubeAnalytics(userId: number, startDate: string, endDate: string) {
  if (!validDate(startDate) || !validDate(endDate) || startDate > endDate) {
    throw new Error("Use valid dates in YYYY-MM-DD format, with startDate no later than endDate.");
  }
  const { accessToken } = await refreshAccessToken(userId);
  const url = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
  url.search = new URLSearchParams({
    ids: "channel==MINE",
    startDate,
    endDate,
    metrics: "views,estimatedMinutesWatched,averageViewDuration,subscribersGained",
    dimensions: "day",
    sort: "day",
  }).toString();
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`YouTube Analytics request failed with HTTP ${response.status}.`);
  const data = await response.json() as { columnHeaders?: Array<{ name: string }>; rows?: Array<Array<string | number>> };
  return {
    columnHeaders: data.columnHeaders?.map((column) => column.name) ?? [],
    rows: data.rows ?? [],
  };
}


async function verifyAssetHash(url: string, expectedSize: number, expectedHash: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(900_000) });
  if (!response.ok || !response.body) throw new Error("Stored video could not be read before YouTube upload.");
  const hash = createHash("sha256");
  let total = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > expectedSize) throw new Error("Stored video size changed after handoff.");
      hash.update(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total !== expectedSize || hash.digest("hex") !== expectedHash) {
    throw new Error("Stored video no longer matches its verified handoff manifest.");
  }
}

async function getResumableOffset(sessionUrl: string, accessToken: string, totalBytes: number) {
  const response = await fetch(sessionUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Length": "0",
      "Content-Range": `bytes */${totalBytes}`,
    },
    body: new Uint8Array(),
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 200 || response.status === 201) {
    const data = await response.json() as { id?: string };
    if (!data.id) throw new Error("YouTube completed an upload but did not return a video ID.");
    return { offset: totalBytes, videoId: data.id };
  }
  if (response.status === 308) {
    const range = response.headers.get("range");
    if (!range) return { offset: 0, videoId: null as string | null };
    const match = /^bytes=0-(\d+)$/.exec(range);
    if (!match) throw new Error("YouTube returned an invalid resumable upload range.");
    return { offset: Number(match[1]) + 1, videoId: null as string | null };
  }
  if (response.status === 404 || response.status === 410) {
    throw new Error("The saved YouTube upload session expired. Reconcile the upload in YouTube Studio before starting a new session.");
  }
  throw new Error(`Could not resume YouTube upload (HTTP ${response.status}).`);
}

export async function publishApprovedYouTubeAssetPrivate(userId: number, assetId: number) {
  if (!isYouTubePublishingEnabled()) throw new Error("YouTube publishing is disabled by YOUTUBE_PUBLISHING_ENABLED.");
  const asset = await getYouTubeAssetById(assetId);
  if (!asset) throw new Error("Video asset was not found.");
  if (asset.status === "uploaded_private" && asset.youtubeVideoId) {
    return { videoId: asset.youtubeVideoId, url: `https://www.youtube.com/watch?v=${asset.youtubeVideoId}`, duplicate: true };
  }
  if (asset.status !== "approved" && !(asset.status === "uploading" && asset.encryptedUploadSessionUrl)) throw new Error("The asset must be explicitly approved before upload.");
  if (!asset.title || asset.title.length > 100) throw new Error("Approved video title is missing or invalid.");
  if (!asset.description || asset.description.length > 5000) throw new Error("Approved video description is missing or invalid.");
  const tags = asset.tagsJson ? JSON.parse(asset.tagsJson) as string[] : [];
  if (!Array.isArray(tags) || tags.length > 500 || tags.some((tag) => typeof tag !== "string" || tag.length > 100)) {
    throw new Error("Approved video tags are invalid.");
  }

  const { accessToken } = await refreshAccessToken(userId);
  const sourceUrl = await storageGetSignedUrl(asset.objectKey);
  await verifyAssetHash(sourceUrl, asset.fileSizeBytes, asset.sha256);

  let sessionUrl = asset.encryptedUploadSessionUrl
    ? decryptYouTubeToken(asset.encryptedUploadSessionUrl)
    : null;
  let offset = 0;

  if (sessionUrl) {
    const resumed = await getResumableOffset(sessionUrl, accessToken, asset.fileSizeBytes);
    if (resumed.videoId) {
      await updateYouTubeAsset(asset.id, {
        status: "uploaded_private",
        youtubeVideoId: resumed.videoId,
        encryptedUploadSessionUrl: null,
      });
      return { videoId: resumed.videoId, url: `https://www.youtube.com/watch?v=${resumed.videoId}`, duplicate: false };
    }
    offset = resumed.offset;
  } else {
    const start = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet%2Cstatus", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(asset.fileSizeBytes),
      },
      body: JSON.stringify({
        snippet: {
          title: asset.title,
          description: asset.description,
          tags,
          categoryId: asset.categoryId ?? "22",
          defaultLanguage: "en",
        },
        status: { privacyStatus: "private" },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!start.ok) throw new Error(`Could not start YouTube resumable upload (HTTP ${start.status}).`);
    sessionUrl = start.headers.get("location");
    if (!sessionUrl || !sessionUrl.startsWith("https://")) throw new Error("YouTube did not return a valid resumable upload URL.");
    await updateYouTubeAsset(asset.id, {
      status: "uploading",
      encryptedUploadSessionUrl: encryptYouTubeToken(sessionUrl),
    });
  }

  const chunkSize = 8 * 1024 * 1024;
  while (offset < asset.fileSizeBytes) {
    const end = Math.min(offset + chunkSize, asset.fileSizeBytes) - 1;
    const source = await fetch(sourceUrl, {
      headers: { Range: `bytes=${offset}-${end}` },
      signal: AbortSignal.timeout(60_000),
    });
    if (source.status !== 206 || !source.body) throw new Error("Storage did not return the requested video byte range.");
    const chunk = Buffer.from(await source.arrayBuffer());
    if (chunk.length !== end - offset + 1) throw new Error("Storage returned an incomplete video chunk.");

    const uploaded = await fetch(sessionUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "video/mp4",
        "Content-Length": String(chunk.length),
        "Content-Range": `bytes ${offset}-${end}/${asset.fileSizeBytes}`,
      },
      body: chunk,
      signal: AbortSignal.timeout(120_000),
    });
    if (uploaded.status === 308) {
      const range = uploaded.headers.get("range");
      const match = range ? /^bytes=0-(\d+)$/.exec(range) : null;
      offset = match ? Number(match[1]) + 1 : end + 1;
      continue;
    }
    if (uploaded.status === 200 || uploaded.status === 201) {
      const result = await uploaded.json() as { id?: string };
      if (!result.id) throw new Error("YouTube upload response did not include a video ID.");
      await updateYouTubeAsset(asset.id, {
        status: "uploaded_private",
        youtubeVideoId: result.id,
        encryptedUploadSessionUrl: null,
      });
      return { videoId: result.id, url: `https://www.youtube.com/watch?v=${result.id}`, duplicate: false };
    }
    throw new Error(`YouTube video upload failed with HTTP ${uploaded.status}.`);
  }

  throw new Error("YouTube upload ended without a final video response.");
}
