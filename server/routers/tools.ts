import { z } from "zod";
import { toolIsAvailable } from "../agent/access";
import { getOrCreateAgentSettings, listApiCatalog } from "../db";
import { convertCurrency, searchNews, searchWeather } from "../agent/tools";
import { protectedProcedure, router } from "../_core/trpc";

function requireProMax(plan: "basic" | "pro_max", tool: "notícias" | "câmbio") {
  if (!toolIsAvailable(plan, tool)) throw new Error("Esta ferramenta faz parte do plano Pro Max.");
}

async function requireCatalogApi(slug: string) {
  const catalog = await listApiCatalog();
  const api = catalog.find((item) => item.slug === slug);
  if (!api || !api.isEnabled || api.approvalStatus !== "approved") {
    throw new Error("Esta API não está aprovada ou foi desativada pelo owner.");
  }
}

export const toolsRouter = router({
  clima: protectedProcedure.input(z.object({ local: z.string().trim().min(2).max(160) })).query(async ({ ctx, input }) => {
    await requireCatalogApi("open-meteo");
    const settings = await getOrCreateAgentSettings(ctx.user.id);
    if (!settings.weatherEnabled) throw new Error("A ferramenta clima está desativada nas configurações.");
    return searchWeather(input.local);
  }),
  notícias: protectedProcedure.input(z.object({ consulta: z.string().trim().min(2).max(240) })).query(async ({ ctx, input }) => {
    requireProMax(ctx.user.plan, "notícias");
    await requireCatalogApi("gdelt");
    const settings = await getOrCreateAgentSettings(ctx.user.id);
    if (!settings.newsEnabled) throw new Error("A ferramenta notícias está desativada nas configurações.");
    return searchNews(input.consulta);
  }),
  câmbio: protectedProcedure.input(z.object({ base: z.string().length(3), destino: z.string().length(3), valor: z.number().positive().max(1_000_000_000) })).query(async ({ ctx, input }) => {
    requireProMax(ctx.user.plan, "câmbio");
    await requireCatalogApi("frankfurter");
    const settings = await getOrCreateAgentSettings(ctx.user.id);
    if (!settings.currencyEnabled) throw new Error("A ferramenta câmbio está desativada nas configurações.");
    return convertCurrency(input.base, input.destino, input.valor);
  }),
});
