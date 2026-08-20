import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { isOwner } from "../agent/access";
import { listApiCatalog, listPlanModels, listUsersForOwner, updateCatalogSetting, updateUserAccess, upsertPlanModel } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

function requireOwner(role: "owner" | "admin" | "user") {
  if (!isOwner(role)) throw new TRPCError({ code: "FORBIDDEN", message: "Somente o owner pode alterar administradores e planos." });
}

export const accessRouter = router({
  listUsers: protectedProcedure.query(async ({ ctx }) => {
    requireOwner(ctx.user.role);
    return listUsersForOwner();
  }),
  updateUser: protectedProcedure.input(z.object({
    userId: z.number().int().positive(),
    role: z.enum(["admin", "user"]),
    plan: z.enum(["basic", "pro_max"]),
  })).mutation(async ({ ctx, input }) => {
    requireOwner(ctx.user.role);
    if (input.userId === ctx.user.id) throw new TRPCError({ code: "BAD_REQUEST", message: "O perfil owner não pode ser alterado por esta tela." });
    const user = await updateUserAccess(input.userId, input.role, input.plan);
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
    return user;
  }),
  apiCatalog: protectedProcedure.query(async ({ ctx }) => {
    requireOwner(ctx.user.role);
    return listApiCatalog();
  }),
  updateApiCatalog: protectedProcedure.input(z.object({
    apiId: z.number().int().positive(),
    isEnabled: z.boolean(),
    credentialReference: z.string().trim().max(128).nullable().optional(),
  })).mutation(async ({ ctx, input }) => {
    requireOwner(ctx.user.role);
    return updateCatalogSetting(input.apiId, input.isEnabled ? 1 : 0, input.credentialReference);
  }),
  planModels: protectedProcedure.query(async ({ ctx }) => {
    requireOwner(ctx.user.role);
    return listPlanModels();
  }),
  savePlanModel: protectedProcedure.input(z.object({
    plan: z.enum(["basic", "pro_max"]),
    modelName: z.string().trim().min(1).max(160),
    isEnabled: z.boolean(),
  })).mutation(async ({ ctx, input }) => {
    requireOwner(ctx.user.role);
    return upsertPlanModel(input.plan, input.modelName, input.isEnabled ? 1 : 0);
  }),
});
