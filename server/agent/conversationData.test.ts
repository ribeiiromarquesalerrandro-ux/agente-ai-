import { describe, expect, it } from "vitest";
import { exportConversationData, normalizeMessageForPersistence } from "./conversationData";

const messages = [
  { role: "user" as const, content: "Olá, \"agente\"", createdAt: new Date("2026-08-20T12:00:00Z") },
  { role: "assistant" as const, content: "Resposta", createdAt: new Date("2026-08-20T12:01:00Z") },
];

describe("persistência e exportação de conversas", () => {
  it("normaliza mensagem antes da persistência", () => {
    expect(normalizeMessageForPersistence({ ...messages[0], content: "  mensagem  " }).content).toBe("mensagem");
    expect(() => normalizeMessageForPersistence({ ...messages[0], content: "   " })).toThrow("não pode ser vazia");
  });

  it("exporta JSON, CSV e texto simples", () => {
    expect(exportConversationData(7, "json", messages).content).toContain('"role": "user"');
    expect(exportConversationData(7, "csv", messages).content).toContain('"Olá, ""agente"""');
    expect(exportConversationData(7, "text", messages).content).toContain("USER");
  });
});
