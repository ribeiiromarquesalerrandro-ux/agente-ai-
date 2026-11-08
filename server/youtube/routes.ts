import type { Express, Request, Response } from "express";
import { saveYouTubeConnection } from "../db";
import { exchangeYouTubeAuthorizationCode, fetchAuthorizedYouTubeChannel } from "./oauth";
import { encryptYouTubeToken, verifyYouTubeOAuthState } from "./security";

function queryString(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerYouTubeRoutes(app: Express) {
  app.get("/api/youtube/oauth/callback", async (req: Request, res: Response) => {
    const providerError = queryString(req, "error");
    if (providerError) {
      res.redirect(302, "/?youtube=authorization_denied");
      return;
    }

    const code = queryString(req, "code");
    const state = queryString(req, "state");
    if (!code || !state) {
      res.status(400).send("YouTube OAuth callback is missing required parameters.");
      return;
    }

    try {
      const payload = verifyYouTubeOAuthState(state);
      const tokens = await exchangeYouTubeAuthorizationCode(code);
      if (!tokens.refresh_token) {
        res.status(400).send("Google did not return a refresh token. Revoke this app's access in Google Account settings and connect again.");
        return;
      }

      const channel = await fetchAuthorizedYouTubeChannel(tokens.access_token);
      await saveYouTubeConnection({
        userId: payload.userId,
        channelId: channel.channelId,
        channelTitle: channel.channelTitle,
        encryptedRefreshToken: encryptYouTubeToken(tokens.refresh_token),
        grantedScopes: tokens.scope ?? "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly",
      });

      res.redirect(302, "/?youtube=connected");
    } catch {
      // Never log OAuth codes, tokens, state payloads, or provider response bodies.
      console.error("[YouTube OAuth] callback failed");
      res.status(400).send("YouTube authorization could not be completed. Check the app configuration and try again.");
    }
  });
}
