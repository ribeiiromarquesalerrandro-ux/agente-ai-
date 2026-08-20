import { z } from "zod";
import { exportConversationData, normalizeMessageForPersistence } from "../agent/conversationData";
import {
  appendConversationMessage,
  createConversation,
  listConversationMessages,
  listConversations,
  saveMemoryEntry,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const conversationIdInput = z.object({ conversationId: z.number().int().positive() });

export const conversationsRouter = router({
  list: protectedProcedure.query(({ ctx }) => listConversations(ctx.user.id)),
  create: protectedProcedure.input(z.object({ title: z.string().trim().min(1).max(180) })).mutation(({ ctx, input }) =>
    createConversation(ctx.user.id, input.title),
  ),
  messages: protectedProcedure.input(conversationIdInput).query(({ ctx, input }) =>
    listConversationMessages(ctx.user.id, input.conversationId),
  ),
  saveMessage: protectedProcedure.input(z.object({
    conversationId: z.number().int().positive(),
    role: z.enum(["user", "assistant", "system", "tool"]),
    content: z.string().trim().min(1).max(20000),
    attachmentUrl: z.string().max(1024).optional(),
  })).mutation(async ({ ctx, input }) => {
    const normalizedMessage = normalizeMessageForPersistence({
      role: input.role,
      content: input.content,
      createdAt: new Date(),
    });
    const message = await appendConversationMessage(ctx.user.id, input.conversationId, {
      role: normalizedMessage.role,
      content: normalizedMessage.content,
      attachmentUrl: input.attachmentUrl,
    });
    if (input.role !== "system") await saveMemoryEntry(ctx.user.id, input.conversationId, input.role, normalizedMessage.content);
    return message;
  }),
  export: protectedProcedure.input(conversationIdInput.extend({ format: z.enum(["json", "csv", "text"]) })).query(async ({ ctx, input }) => {
    const messages = await listConversationMessages(ctx.user.id, input.conversationId);
    return exportConversationData(input.conversationId, input.format, messages);
  }),
});
