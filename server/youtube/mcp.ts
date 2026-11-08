import { timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { getUserByOpenId, getYouTubeConnection } from "../db";
import { ENV } from "../_core/env";
import { buildYouTubeAuthorizationUrl } from "./oauth";
import { createYouTubeOAuthState } from "./security";

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
];

async function callTool(name: string) {
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

  throw new Error("Unknown YouTube MCP tool.");
}

async function handleJsonRpc(message: JsonRpcRequest) {
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
      instructions: "Read-only YouTube connection status and explicit OAuth connection setup. Uploading and publishing tools are not enabled.",
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
      const result = await callTool(name);
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
    if (!accept.includes("application/json") && !accept.includes("text/event-stream")) {
      res.status(406).json({ error: "Accept must include application/json or text/event-stream." });
      return;
    }

    const message = req.body as JsonRpcRequest;
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
