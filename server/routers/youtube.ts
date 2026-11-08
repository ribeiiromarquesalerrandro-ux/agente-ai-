import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getYouTubeConnection } from "../db";
import { buildYouTubeAuthorizationUrl } from "../youtube/oauth";
import { createYouTubeOAuthState } from "../youtube/security";

function requireOwner(role: "owner" | "admin" | "user") {
  if (role !== "owner") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Somente o owner pode conectar o canal do YouTube." });
  }
}

export const youtubeRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    requireOwner(ctx.user.role);
    const connection = await getYouTubeConnection(ctx.user.id);
    return connection
      ? {
          connected: true as const,
          channelId: connection.channelId,
          channelTitle: connection.channelTitle,
          grantedScopes: connection.grantedScopes,
          connectedAt: connection.connectedAt,
        }
      : { connected: false as const };
  }),

  connect: protectedProcedure.mutation(({ ctx }) => {
    requireOwner(ctx.user.role);
    const state = createYouTubeOAuthState(ctx.user.id);
    return { authorizationUrl: buildYouTubeAuthorizationUrl(state) };
  }),
});
