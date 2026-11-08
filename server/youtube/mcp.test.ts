import { describe, expect, it } from "vitest";
import { handleJsonRpc } from "./mcp";

describe("YouTube remote MCP JSON-RPC", () => {
  it("negotiates a supported protocol version", async () => {
    const response = await handleJsonRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18" },
    }) as { result: { protocolVersion: string; capabilities: { tools: object } } };
    expect(response.result.protocolVersion).toBe("2025-06-18");
    expect(response.result.capabilities.tools).toBeDefined();
  });

  it("advertises the connection, channel and Analytics tools", async () => {
    const response = await handleJsonRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }) as {
      result: { tools: Array<{ name: string }> };
    };
    expect(response.result.tools.map((tool) => tool.name)).toEqual([
      "youtube_connection_status",
      "youtube_start_channel_connection",
      "youtube_channel_summary",
      "youtube_recent_videos",
      "youtube_analytics_daily",
      "youtube_list_pending_assets",
      "youtube_approve_asset",
      "youtube_publish_approved_asset",
    ]);
  });

  it("answers ping", async () => {
    expect(await handleJsonRpc({ jsonrpc: "2.0", id: 3, method: "ping" })).toEqual({
      jsonrpc: "2.0",
      id: 3,
      result: {},
    });
  });

  it("does not answer notifications", async () => {
    expect(await handleJsonRpc({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
  });

  it("returns method not found for unsupported methods", async () => {
    const response = await handleJsonRpc({ jsonrpc: "2.0", id: 4, method: "resources/list" }) as {
      error: { code: number };
    };
    expect(response.error.code).toBe(-32601);
  });
});
