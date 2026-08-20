import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { isOwner, isProMax, permittedContextSize } from "../agent/access";
import { getGitHubConnectionStatus } from "../agent/github";
import { normalizeAgentPreferences } from "../agent/preferences";
import { getOrCreateAgentSettings, listApiCatalog, listEnabledModelsForPlan, listMemoryEntries, updateAgentSettings } from "../db";
import { selectRelevantMemory } from "../agent/memory";
import { protectedProcedure, router } from "../_core/trpc";

const settingsInput = z.object({
  ollamaUrl: z.string().trim().url().max(512),
  activeModel: z.string().trim().min(1).max(160),
  temperature: z.number().int().min(0).max(200),
  contextSize: z.number().int().min(512).max(131072),
  systemPrompt: z.string().trim().min(10).max(12000),
  weatherEnabled: z.boolean(),
  newsEnabled: z.boolean(),
  currencyEnabled: z.boolean(),
  githubEnabled: z.boolean(),
});

export const agentRouter = router({
  settings: protectedProcedure.query(async ({ ctx }) => {
    const settings = await getOrCreateAgentSettings(ctx.user.id);
    const allowedModels = await listEnabledModelsForPlan(ctx.user.plan);
    return { ...settings, isOwner: isOwner(ctx.user.role), plan: ctx.user.plan, allowedModels };
  }),
  saveSettings: protectedProcedure.input(settingsInput).mutation(async ({ ctx, input }) => {
    const owner = isOwner(ctx.user.role);
    const allowedModels = await listEnabledModelsForPlan(ctx.user.plan);
    const normalized = normalizeAgentPreferences(ctx.user.plan, owner, allowedModels, input);
    const settings = await updateAgentSettings(ctx.user.id, {
      ...input,
      temperature: input.temperature,
      contextSize: normalized.contextSize,
      weatherEnabled: input.weatherEnabled ? 1 : 0,
      newsEnabled: normalized.newsEnabled ? 1 : 0,
      currencyEnabled: normalized.currencyEnabled ? 1 : 0,
      githubEnabled: normalized.githubEnabled ? 1 : 0,
    });
    return { ...settings, isOwner: owner, plan: ctx.user.plan, allowedModels };
  }),
  memory: protectedProcedure.input(z.object({ query: z.string().trim().min(1).max(4000) })).query(async ({ ctx, input }) => {
    const memories = await listMemoryEntries(ctx.user.id);
    return selectRelevantMemory(input.query, memories);
  }),
  apiCatalog: protectedProcedure.query(async () => listApiCatalog()),
  githubStatus: protectedProcedure.query(async ({ ctx }) => ({
    isOwner: isOwner(ctx.user.role),
    ...(await getGitHubConnectionStatus()),
  })),
  requireOwner: protectedProcedure.query(({ ctx }) => {
    if (!isOwner(ctx.user.role)) throw new TRPCError({ code: "FORBIDDEN", message: "Apenas o owner pode alterar esta configuração." });
    return { isOwner: true };
  }),
});
