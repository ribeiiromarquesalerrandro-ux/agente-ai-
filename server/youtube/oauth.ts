import { z } from "zod";

const youtubeEnvironmentSchema = z.object({
  YOUTUBE_CLIENT_ID: z.string().min(1),
  YOUTUBE_CLIENT_SECRET: z.string().min(1),
  YOUTUBE_REDIRECT_URI: z.string().url(),
  YOUTUBE_TOKEN_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
  YOUTUBE_OAUTH_STATE_SECRET: z.string().min(32),
});

export type YouTubeEnvironment = z.infer<typeof youtubeEnvironmentSchema>;

export function getYouTubeEnvironment(): YouTubeEnvironment {
  return youtubeEnvironmentSchema.parse({
    YOUTUBE_CLIENT_ID: process.env.YOUTUBE_CLIENT_ID,
    YOUTUBE_CLIENT_SECRET: process.env.YOUTUBE_CLIENT_SECRET,
    YOUTUBE_REDIRECT_URI: process.env.YOUTUBE_REDIRECT_URI,
    YOUTUBE_TOKEN_ENCRYPTION_KEY: process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY,
    YOUTUBE_OAUTH_STATE_SECRET: process.env.YOUTUBE_OAUTH_STATE_SECRET,
  });
}

export function isYouTubePublishingEnabled(): boolean {
  return process.env.YOUTUBE_PUBLISHING_ENABLED === "true";
}

export function buildYouTubeAuthorizationUrl(state: string): string {
  const env = getYouTubeEnvironment();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: env.YOUTUBE_CLIENT_ID,
    redirect_uri: env.YOUTUBE_REDIRECT_URI,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  }).toString();
  return url.toString();
}

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

export async function exchangeYouTubeAuthorizationCode(code: string): Promise<GoogleTokenResponse> {
  const env = getYouTubeEnvironment();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.YOUTUBE_CLIENT_ID,
      client_secret: env.YOUTUBE_CLIENT_SECRET,
      redirect_uri: env.YOUTUBE_REDIRECT_URI,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    // Do not include Google's response body: it can contain sensitive OAuth diagnostics.
    throw new Error(`Google OAuth token exchange failed with HTTP ${response.status}.`);
  }
  const data = await response.json() as Partial<GoogleTokenResponse>;
  if (typeof data.access_token !== "string" || typeof data.expires_in !== "number" || data.token_type !== "Bearer") {
    throw new Error("Google returned an incomplete OAuth token response.");
  }
  return data as GoogleTokenResponse;
}

export async function fetchAuthorizedYouTubeChannel(accessToken: string): Promise<{ channelId: string; channelTitle: string }> {
  const response = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=id%2Csnippet&mine=true",
    { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) },
  );
  if (!response.ok) throw new Error(`Could not verify the authorized YouTube channel (HTTP ${response.status}).`);
  const data = await response.json() as { items?: Array<{ id?: string; snippet?: { title?: string } }> };
  const channel = data.items?.[0];
  if (!channel?.id) throw new Error("The Google account did not return an accessible YouTube channel.");
  return { channelId: channel.id, channelTitle: channel.snippet?.title ?? "YouTube channel" };
}
