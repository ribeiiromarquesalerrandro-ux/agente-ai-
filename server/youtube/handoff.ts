import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { ENV } from "../_core/env";
import { createYouTubeAsset, getYouTubeAssetByProductionId } from "../db";

type HandoffManifest = {
  productionId: string;
  fileName: string;
  fileSizeBytes: number;
  sha256: string;
  qaStatus: "PASS";
};

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function isHandoffAuthorized(req: Request): boolean {
  const secret = process.env.YOUTUBE_HANDOFF_SECRET ?? "";
  const authorization = req.header("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  return Buffer.byteLength(secret, "utf8") >= 32 && supplied.length > 0 && safeEqual(secret, supplied);
}

export function parseHandoffManifest(body: unknown): HandoffManifest | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  if (typeof value.productionId !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(value.productionId)) return null;
  if (typeof value.fileName !== "string" || value.fileName !== value.productionId + ".mp4") return null;
  if (typeof value.fileSizeBytes !== "number" || !Number.isSafeInteger(value.fileSizeBytes) || value.fileSizeBytes <= 0) return null;
  if (typeof value.sha256 !== "string" || !/^[a-fA-F0-9]{64}$/.test(value.sha256)) return null;
  if (value.qaStatus !== "PASS") return null;
  const maximum = Number(process.env.YOUTUBE_HANDOFF_MAX_BYTES ?? 1073741824);
  if (!Number.isSafeInteger(maximum) || value.fileSizeBytes > maximum) return null;
  return {
    productionId: value.productionId,
    fileName: value.fileName,
    fileSizeBytes: value.fileSizeBytes,
    sha256: value.sha256.toLowerCase(),
    qaStatus: "PASS",
  };
}

async function createPresignedPutUrl(objectKey: string): Promise<string> {
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) throw new Error("Storage service is not configured.");
  const endpoint = new URL("v1/storage/presign/put", ENV.forgeApiUrl.replace(/\/+$/, "") + "/");
  endpoint.searchParams.set("path", objectKey);
  const response = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("Could not create temporary storage upload URL.");
  const data = await response.json() as { url?: string };
  if (!data.url || !data.url.startsWith("https://")) throw new Error("Storage service returned an invalid upload URL.");
  return data.url;
}

async function verifyStoredObject(objectKey: string, expectedSize: number, expectedSha256: string): Promise<void> {
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) throw new Error("Storage service is not configured.");
  const endpoint = new URL("v1/storage/presign/get", ENV.forgeApiUrl.replace(/\/+$/, "") + "/");
  endpoint.searchParams.set("path", objectKey);
  const presign = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${ENV.forgeApiKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!presign.ok) throw new Error("Could not verify the uploaded video in storage.");
  const data = await presign.json() as { url?: string };
  if (!data.url || !data.url.startsWith("https://")) throw new Error("Storage service returned an invalid download URL.");

  const response = await fetch(data.url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok || !response.body) throw new Error("Stored video could not be read for verification.");
  const hash = createHash("sha256");
  let totalBytes = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > expectedSize) throw new Error("Stored video is larger than the declared size.");
      hash.update(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (totalBytes !== expectedSize) throw new Error("Stored video size does not match the manifest.");
  if (hash.digest("hex") !== expectedSha256) throw new Error("Stored video SHA-256 does not match the manifest.");
}

export function registerYouTubeHandoffRoutes(app: Express) {
  app.post("/api/youtube/handoff/prepare", async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isHandoffAuthorized(req)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const manifest = parseHandoffManifest(req.body);
    if (!manifest) {
      res.status(400).json({ error: "Manifest invalid. Require productionId, matching MP4 filename, positive size, SHA-256 and QA PASS." });
      return;
    }
    try {
      const existing = await getYouTubeAssetByProductionId(manifest.productionId);
      if (existing) {
        if (existing.sha256 !== manifest.sha256 || existing.fileSizeBytes !== manifest.fileSizeBytes) {
          res.status(409).json({ error: "Production ID already exists with different file contents." });
          return;
        }
        res.status(200).json({ duplicate: true, accepted: true, assetId: existing.id, status: existing.status });
        return;
      }
      const objectKey = `youtube-handoff/${manifest.productionId}/${randomUUID()}.mp4`;
      const uploadUrl = await createPresignedPutUrl(objectKey);
      res.status(200).json({
        uploadUrl,
        objectKey,
        method: "PUT",
        contentType: "video/mp4",
        expiresInNote: "Temporary signed URL; upload immediately.",
      });
    } catch {
      res.status(502).json({ error: "Could not prepare the video handoff." });
    }
  });

  app.post("/api/youtube/handoff/complete", async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isHandoffAuthorized(req)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const manifest = parseManifest(req.body);
    const objectKey = req.body && typeof req.body === "object" ? (req.body as Record<string, unknown>).objectKey : undefined;
    if (!manifest || typeof objectKey !== "string" ||
        !objectKey.startsWith(`youtube-handoff/${manifest.productionId}/`) ||
        !objectKey.endsWith(".mp4") || objectKey.includes("..")) {
      res.status(400).json({ error: "Invalid handoff completion payload." });
      return;
    }
    try {
      const existing = await getYouTubeAssetByProductionId(manifest.productionId);
      if (existing) {
        if (existing.sha256 !== manifest.sha256 || existing.fileSizeBytes !== manifest.fileSizeBytes) {
          res.status(409).json({ error: "Production ID already exists with different file contents." });
          return;
        }
        res.status(200).json({ accepted: true, duplicate: true, assetId: existing.id, status: existing.status });
        return;
      }
      await verifyStoredObject(objectKey, manifest.fileSizeBytes, manifest.sha256);
      const asset = await createYouTubeAsset({
        ...manifest,
        objectKey,
      });
      if (!asset) throw new Error("Asset persistence failed.");
      res.status(201).json({
        accepted: true,
        assetId: asset.id,
        status: asset.status,
        message: "Video received and verified. It is waiting for owner approval; no YouTube upload has started.",
      });
    } catch {
      res.status(422).json({ error: "Video verification or registration failed. No YouTube upload was started." });
    }
  });
}
