import { afterEach, describe, expect, it } from "vitest";
import {
  createYouTubeOAuthState,
  decryptYouTubeToken,
  encryptYouTubeToken,
  verifyYouTubeOAuthState,
} from "./security";

const originalEncryptionKey = process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY;
const originalStateSecret = process.env.YOUTUBE_OAUTH_STATE_SECRET;

afterEach(() => {
  if (originalEncryptionKey === undefined) delete process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY;
  else process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY = originalEncryptionKey;
  if (originalStateSecret === undefined) delete process.env.YOUTUBE_OAUTH_STATE_SECRET;
  else process.env.YOUTUBE_OAUTH_STATE_SECRET = originalStateSecret;
});

describe("YouTube credential security", () => {
  it("encrypts and decrypts a refresh token without storing plaintext", () => {
    process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    const token = "google-refresh-token-example";
    const encrypted = encryptYouTubeToken(token);
    expect(encrypted).not.toContain(token);
    expect(decryptYouTubeToken(encrypted)).toBe(token);
  });

  it("rejects tampered encrypted tokens", () => {
    process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    const encrypted = encryptYouTubeToken("refresh-token");
    expect(() => decryptYouTubeToken(encrypted.slice(0, -2) + "xx")).toThrow();
  });

  it("signs and verifies short-lived OAuth state", () => {
    process.env.YOUTUBE_OAUTH_STATE_SECRET = "state-secret-for-tests-at-least-32";
    const state = createYouTubeOAuthState(42, 1_000);
    expect(verifyYouTubeOAuthState(state, 1_001).userId).toBe(42);
  });

  it("rejects altered and expired OAuth state", () => {
    process.env.YOUTUBE_OAUTH_STATE_SECRET = "state-secret-for-tests-at-least-32";
    const state = createYouTubeOAuthState(42, 1_000);
    expect(() => verifyYouTubeOAuthState(state + "x", 1_001)).toThrow();
    expect(() => verifyYouTubeOAuthState(state, 1_601)).toThrow();
  });
});
