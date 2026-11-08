import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const ENCRYPTION_VERSION = "v1";
const STATE_TTL_SECONDS = 10 * 60;

function decodeBase64Url(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function getEncryptionKey(): Buffer {
  const value = process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY ?? "";
  if (!/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error("YOUTUBE_TOKEN_ENCRYPTION_KEY must be a 32-byte key encoded as 64 hexadecimal characters.");
  }
  return Buffer.from(value, "hex");
}

function getStateSecret(): Buffer {
  const value = process.env.YOUTUBE_OAUTH_STATE_SECRET ?? "";
  if (Buffer.byteLength(value, "utf8") < 32) {
    throw new Error("YOUTUBE_OAUTH_STATE_SECRET must contain at least 32 bytes.");
  }
  return Buffer.from(value, "utf8");
}

export function encryptYouTubeToken(plainText: string): string {
  if (!plainText) throw new Error("Cannot encrypt an empty YouTube token.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENCRYPTION_VERSION, iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptYouTubeToken(value: string): string {
  const [version, ivPart, tagPart, encryptedPart, extra] = value.split(".");
  if (version !== ENCRYPTION_VERSION || !ivPart || !tagPart || !encryptedPart || extra) {
    throw new Error("Unsupported or malformed encrypted YouTube token.");
  }
  const iv = decodeBase64Url(ivPart);
  const tag = decodeBase64Url(tagPart);
  const encrypted = decodeBase64Url(encryptedPart);
  if (iv.length !== 12 || tag.length !== 16 || encrypted.length === 0) {
    throw new Error("Malformed encrypted YouTube token.");
  }
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

type OAuthStatePayload = {
  userId: number;
  nonce: string;
  expiresAt: number;
};

export function createYouTubeOAuthState(userId: number, nowSeconds = Math.floor(Date.now() / 1000)): string {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("Invalid user id for YouTube OAuth state.");
  const payload: OAuthStatePayload = {
    userId,
    nonce: randomBytes(24).toString("base64url"),
    expiresAt: nowSeconds + STATE_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", getStateSecret()).update(encoded).digest("base64url");
  return encoded + "." + signature;
}

export function verifyYouTubeOAuthState(state: string, nowSeconds = Math.floor(Date.now() / 1000)): OAuthStatePayload {
  const parts = state.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error("Invalid YouTube OAuth state.");
  const [encoded, suppliedSignature] = parts;
  const expectedSignature = createHmac("sha256", getStateSecret()).update(encoded).digest();
  const actualSignature = decodeBase64Url(suppliedSignature);
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
    throw new Error("Invalid YouTube OAuth state signature.");
  }
  let payload: OAuthStatePayload;
  try {
    payload = JSON.parse(decodeBase64Url(encoded).toString("utf8")) as OAuthStatePayload;
  } catch {
    throw new Error("Malformed YouTube OAuth state.");
  }
  if (!Number.isSafeInteger(payload.userId) || payload.userId <= 0 ||
      typeof payload.nonce !== "string" || payload.nonce.length < 20 ||
      !Number.isSafeInteger(payload.expiresAt) || payload.expiresAt < nowSeconds) {
    throw new Error("Expired or invalid YouTube OAuth state.");
  }
  return payload;
}
