import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "../_core/context";

const dbMocks = vi.hoisted(() => ({
  appendConversationMessage: vi.fn(),
  createConversation: vi.fn(),
  listConversationMessages: vi.fn(),
  listConversations: vi.fn(),
  saveMemoryEntry: vi.fn(),
}));

vi.mock("../db", () => dbMocks);

import { conversationsRouter } from "./conversations";

const ctx = {
  user: {
    id: 42,
    openId: "owner-test",
    name: "Owner",
    email: "owner@example.com",
    loginMethod: "manus",
    role: "owner",
    plan: "pro_max",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
} as unknown as TrpcContext;

describe("conversationsRouter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.createConversation.mockResolvedValue({ id: 9, userId: 42, title: "Projeto", createdAt: new Date(), updatedAt: new Date() });
    dbMocks.listConversations.mockResolvedValue([]);
    dbMocks.listConversationMessages.mockResolvedValue([]);
    dbMocks.appendConversationMessage.mockResolvedValue({ id: 1, conversationId: 9, role: "user", content: "mensagem", createdAt: new Date() });
    dbMocks.saveMemoryEntry.mockResolvedValue(undefined);
  });

  it("cria e lista conversas usando o usuário autenticado", async () => {
    const caller = conversationsRouter.createCaller(ctx);
    await caller.create({ title: "Projeto" });
    await caller.list();
    expect(dbMocks.createConversation).toHaveBeenCalledWith(42, "Projeto");
    expect(dbMocks.listConversations).toHaveBeenCalledWith(42);
  });

  it("persiste mensagem normalizada, anexo e memória contextual", async () => {
    const caller = conversationsRouter.createCaller(ctx);
    await caller.saveMessage({ conversationId: 9, role: "user", content: "  mensagem  ", attachmentUrl: "https://example.test/audio.webm" });
    expect(dbMocks.appendConversationMessage).toHaveBeenCalledWith(42, 9, {
      role: "user", content: "mensagem", attachmentUrl: "https://example.test/audio.webm",
    });
    expect(dbMocks.saveMemoryEntry).toHaveBeenCalledWith(42, 9, "user", "mensagem");
  });
});
