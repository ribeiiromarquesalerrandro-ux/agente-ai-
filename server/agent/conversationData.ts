export type PersistedMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt: Date;
};

export function normalizeMessageForPersistence(message: PersistedMessage) {
  const content = message.content.trim();
  if (!content) throw new Error("A mensagem não pode ser vazia.");
  return { ...message, content };
}

export function exportConversationData(conversationId: number, format: "json" | "csv" | "text", messages: PersistedMessage[]) {
  if (format === "json") {
    return { filename: `conversa-${conversationId}.json`, contentType: "application/json", content: JSON.stringify(messages, null, 2) };
  }
  if (format === "csv") {
    const esc = (value: string) => `"${value.replaceAll('"', '""')}"`;
    return { filename: `conversa-${conversationId}.csv`, contentType: "text/csv", content: ["data,papel,mensagem", ...messages.map((m) => `${m.createdAt.toISOString()},${m.role},${esc(m.content)}`)].join("\n") };
  }
  return { filename: `conversa-${conversationId}.txt`, contentType: "text/plain", content: messages.map((m) => `[${m.createdAt.toLocaleString("pt-BR")}] ${m.role.toUpperCase()}\n${m.content}`).join("\n\n") };
}
