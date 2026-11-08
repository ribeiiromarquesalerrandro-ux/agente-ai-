import { timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { getUserByOpenId, getYouTubeConnection, getYouTubeAssetById, listYouTubeAssets, updateYouTubeAsset } from "../db";
import { ENV } from "../_core/env";
import { buildYouTubeAuthorizationUrl } from "./oauth";
import { createYouTubeOAuthState } from "./security";
import { getYouTubeAnalytics, getYouTubeChannelSummary, getYouTubeRecentVideos, publishApprovedYouTubeAssetPrivate } from "./api";

const MCP_PROTOCOL_VERSIONS = new Set(["2025-03-26", "2025-06-18"]);
const MCP_SERVER_INFO = {
  name: "agente-ai-youtube",
  title: "Agente AI — YouTube",
  version: "0.1.0",
};

type JsonRpcRequest = {
  jsonrpc?: unknown;
  id?: string | number | null;
  method?: unknown;
  params?: Record<string, unknown>;
};

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function isAuthorized(req: Request): boolean {
  const configuredKey = process.env.YOUTUBE_MCP_API_KEY ?? "";
  if (Buffer.byteLength(configuredKey, "utf8") < 32) return false;
  const authorization = req.header("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  return supplied.length > 0 && safeEqual(supplied, configuredKey);
}

function jsonRpcError(id: JsonRpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function jsonRpcResult(id: JsonRpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function toolText(text: string) {
  return { content: [{ type: "text", text }] };
}

async function getOwner() {
  if (!ENV.ownerOpenId) throw new Error("Owner account is not configured.");
  const owner = await getUserByOpenId(ENV.ownerOpenId);
  if (!owner || owner.role !== "owner") throw new Error("Configured owner account was not found.");
  return owner;
}

const TOOL_DEFINITIONS = [
  {
    name: "youtube_connection_status",
    title: "YouTube connection status",
    description: "Returns whether the configured owner has connected a YouTube channel. Does not expose credentials.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "youtube_start_channel_connection",
    title: "Start YouTube channel connection",
    description: "Creates a short-lived Google OAuth authorization URL for the configured owner. The owner must open the URL and approve access. Does not publish videos.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "youtube_channel_summary",
    title: "YouTube channel summary",
    description: "Reads the connected channel's current title, total views, subscriber count and video count.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "youtube_recent_videos",
    title: "Recent YouTube videos",
    description: "Lists the owner's latest uploaded videos with title, publication date and URL.",
    inputSchema: {
      type: "object",
      properties: { maxResults: { type: "integer", minimum: 1, maximum: 25, default: 10 } },
      additionalProperties: false,
    },
  },
  {
    name: "youtube_analytics_daily",
    title: "Daily YouTube Analytics",
    description: "Reads daily views, estimated watch minutes, average view duration and subscribers gained for a date range.",
    inputSchema: {
      type: "object",
      properties: {
        startDate: { type: "string", description: "Start date, YYYY-MM-DD." },
        endDate: { type: "string", description: "End date, YYYY-MM-DD." },
      },
      required: ["startDate", "endDate"],
      additionalProperties: false,
    },
  },
  {
    name: "youtube_list_pending_assets",
    title: "List pending production videos",
    description: "Lists finished videos received from the production engine with QA PASS that are awaiting owner approval.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "youtube_approve_asset",
    title: "Approve a video for private upload",
    description: "Stores the owner's approved title, description and tags for one QA-passed asset. This does not upload the video.",
    inputSchema: {
      type: "object",
      properties: {
        assetId: { type: "integer", minimum: 1 },
        title: { type: "string", minLength: 1, maxLength: 100 },
        description: { type: "string", maxLength: 5000 },
        tags: { type: "array", items: { type: "string", maxLength: 100 }, maxItems: 500 },
        categoryId: { type: "string", pattern: "^[0-9]{1,3}$" },
      },
      required: ["assetId", "title", "description"],
      additionalProperties: false,
    },
  },
  {
    name: "youtube_publish_approved_asset",
    title: "Upload approved video privately",
    description: "Uploads an already approved asset to YouTube with privacyStatus=private. Requires confirmPrivate=true and YOUTUBE_PUBLISHING_ENABLED=true. Never publishes publicly or schedules.",
    inputSchema: {
      type: "object",
      properties: {
        assetId: { type: "integer", minimum: 1 },
        confirmPrivate: { type: "boolean" },
      },
      required: ["assetId", "confirmPrivate"],
      additionalProperties: false,
    },
  },
];

async function callTool(name: string, args: Record<string, unknown> = {}) {
  const owner = await getOwner();

  if (name === "youtube_connection_status") {
    const connection = await getYouTubeConnection(owner.id);
    if (!connection) {
      return toolText("YouTube channel is not connected. Use youtube_start_channel_connection to begin Google authorization.");
    }
    return toolText(JSON.stringify({
      connected: true,
      channelId: connection.channelId,
      channelTitle: connection.channelTitle,
      grantedScopes: connection.grantedScopes,
      connectedAt: connection.connectedAt,
    }));
  }

  if (name === "youtube_start_channel_connection") {
    const state = createYouTubeOAuthState(owner.id);
    return toolText(JSON.stringify({
      authorizationUrl: buildYouTubeAuthorizationUrl(state),
      expiresInSeconds: 600,
      instructions: "Open this URL in a browser while signed in to the Google account that owns the intended YouTube channel. Review and approve the requested permissions. This only connects the channel; it does not upload or publish anything.",
    }));
  }

  if (name === "youtube_channel_summary") {
    return toolText(JSON.stringify(await getYouTubeChannelSummary(owner.id)));
  }
  if (name === "youtube_recent_videos") {
    const maxResults = typeof args.maxResults === "number" ? args.maxResults : 10;
    return toolText(JSON.stringify(await getYouTubeRecentVideos(owner.id, maxResults)));
  }
  if (name === "youtube_analytics_daily") {
    if (typeof args.startDate !== "string" || typeof args.endDate !== "string") {
      throw new Error("Both startDate and endDate are required in YYYY-MM-DD format.");
    }
    return toolText(JSON.stringify(await getYouTubeAnalytics(owner.id, args.startDate, args.endDate)));
  }
  if (name === "youtube_list_pending_assets") {
    const assets = await listYouTubeAssets("received");
    return toolText(JSON.stringify(assets));
  }
  if (name === "youtube_approve_asset") {
    const assetId = args.assetId;
    const title = args.title;
    const description = args.description;
    const tags = args.tags === undefined ? [] : args.tags;
    const categoryId = args.categoryId === undefined ? "22" : args.categoryId;
    if (typeof assetId !== "number" || !Number.isSafeInteger(assetId) || assetId <= 0 ||
        typeof title !== "string" || title.trim().length === 0 || title.length > 100 ||
        typeof description !== "string" || description.length > 5000 ||
        !Array.isArray(tags) || tags.length > 500 ||
        tags.some((tag) => typeof tag !== "string" || tag.length > 100) ||
        typeof categoryId !== "string" || !/^[0-9]{1,3}$/.test(categoryId)) {
      throw new Error("Invalid approval metadata.");
    }
    const asset = await getYouTubeAssetById(assetId);
    if (!asset || asset.status !== "received" || asset.qaStatus !== "PASS") {
      throw new Error("Only a received asset with QA PASS can be approved.");
    }
    const approved = await updateYouTubeAsset(assetId, {
      status: "approved",
      title: title.trim(),
      description,
      tagsJson: JSON.stringify(tags),
      categoryId,
      approvedAt: new Date(),
    });
    return toolText(JSON.stringify({ approved: true, assetId, status: approved?.status, privacy: "private" }));
  }
  if (name === "youtube_publish_approved_asset") {
    if (typeof args.assetId !== "number" || !Number.isSafeInteger(args.assetId) || args.assetId <= 0 || args.confirmPrivate !== true) {
      throw new Error("Provide a valid assetId and confirmPrivate=true to start a private upload.");
    }
    return toolText(JSON.stringify(await publishApprovedYouTubeAssetPrivate(owner.id, args.assetId)));
  }
  throw new Error("Unknown YouTube MCP tool.");
}

export async function handleJsonRpc(message: JsonRpcRequest) {
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return jsonRpcError(message.id, -32600, "Invalid JSON-RPC request.");
  }

  // Notifications have no id and must not receive a JSON-RPC response.
  if (message.method === "notifications/initialized" || message.method === "notifications/cancelled") {
    return null;
  }

  if (message.method === "initialize") {
    const requestedVersion = typeof message.params?.protocolVersion === "string"
      ? message.params.protocolVersion
      : "2025-03-26";
    const protocolVersion = MCP_PROTOCOL_VERSIONS.has(requestedVersion) ? requestedVersion : "2025-03-26";
    return jsonRpcResult(message.id, {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: MCP_SERVER_INFO,
      instructions: "YouTube connection, channel summary, recent video, Analytics, production handoff review and explicitly approved private uploads. Public publishing and scheduling are not supported.",
    });
  }

  if (message.method === "ping") return jsonRpcResult(message.id, {});

  if (message.method === "tools/list") {
    return jsonRpcResult(message.id, { tools: TOOL_DEFINITIONS });
  }

  if (message.method === "tools/call") {
    const params = message.params ?? {};
    const name = params.name;
    const args = params.arguments;
    if (typeof name !== "string" || (args !== undefined && (typeof args !== "object" || args === null || Array.isArray(args)))) {
      return jsonRpcError(message.id, -32602, "Invalid tool arguments.");
    }
    try {
      const result = await callTool(name, (args ?? {}) as Record<string, unknown>);
      return jsonRpcResult(message.id, result);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Tool execution failed.";
      return jsonRpcResult(message.id, {
        ...toolText(messageText),
        isError: true,
      });
    }
  }

  return jsonRpcError(message.id, -32601, "Method not found.");
}

export function registerYouTubeMcpRoutes(app: Express) {
  app.post("/mcp/youtube", async (req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Authorization");

    if (!isAuthorized(req)) {
      res.setHeader("WWW-Authenticate", "Bearer");
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const accept = req.header("accept") ?? "";
    if (!accept.includes("application/json") || !accept.includes("text/event-stream")) {
      res.status(406).json({ error: "Accept must include both application/json and text/event-stream." });
      return;
    }

    if (!req.is("application/json")) {
      res.status(415).json({ error: "Content-Type must be application/json." });
      return;
    }
    const message = req.body as JsonRpcRequest | undefined;
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      res.status(400).json({ error: "A JSON-RPC request body is required." });
      return;
    }
    const headerVersion = req.header("MCP-Protocol-Version");
    if (headerVersion && !MCP_PROTOCOL_VERSIONS.has(headerVersion)) {
      res.status(400).json({ error: "Unsupported MCP-Protocol-Version header." });
      return;
    }
    const bodyVersion = message.method === "initialize" && typeof message.params?.protocolVersion === "string"
      ? message.params.protocolVersion
      : undefined;
    const negotiatedVersion = headerVersion ?? (bodyVersion && MCP_PROTOCOL_VERSIONS.has(bodyVersion) ? bodyVersion : "2025-03-26");
    res.setHeader("MCP-Protocol-Version", negotiatedVersion);
    const response = await handleJsonRpc(message);
    if (response === null) {
      res.status(202).end();
      return;
    }
    res.status(200).type("application/json").send(response);
  });

  app.get("/mcp/youtube", (_req: Request, res: Response) => {
    res.setHeader("Allow", "POST");
    res.status(405).send("This stateless MCP endpoint accepts POST requests only.");
  });

  app.delete("/mcp/youtube", (_req: Request, res: Response) => {
    res.setHeader("Allow", "POST");
    res.status(405).send("This stateless MCP endpoint does not use sessions.");
  });
}
