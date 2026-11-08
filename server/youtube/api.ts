import { getYouTubeConnectionWithCredentials } from "../db";
import { decryptYouTubeToken, encryptYouTubeToken } from "./security";
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
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + "T00:00:00Z"));
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
