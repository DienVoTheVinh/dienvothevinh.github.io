export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.meet.readonly";
export const DRIVE_METADATA_SCOPE = "https://www.googleapis.com/auth/drive.metadata.readonly";
export const MEET_SPACE_SCOPE = "https://www.googleapis.com/auth/meetings.space.readonly";
export const IDENTITY_SCOPES = ["openid", "email"];

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function randomToken(bytes = 32): string {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return bytesToBase64(data).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function encryptionKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("GOOGLE_TOKEN_ENCRYPTION_KEY");
  if (!secret || secret.length < 32) throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY chưa được cấu hình an toàn.");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value));
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function decryptSecret(value: string): Promise<string> {
  const [version, iv64, data64] = value.split(".");
  if (version !== "v1" || !iv64 || !data64) throw new Error("Dữ liệu OAuth không hợp lệ.");
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv64) }, await encryptionKey(), base64ToBytes(data64));
  return new TextDecoder().decode(clear);
}

export function googleClientConfig() {
  // Reuse the existing Drive OAuth client secrets when available. Keeping the
  // values in Supabase avoids copying or exposing them during deployment.
  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") || Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") || Deno.env.get("GOOGLE_CLIENT_SECRET");
  const callbackUrl = Deno.env.get("GOOGLE_OAUTH_CALLBACK_URL")
    || "https://nrnokgciogxqzjqjeuwi.supabase.co/functions/v1/google-drive-oauth-callback";
  if (!clientId || !clientSecret || !callbackUrl) throw new Error("Google OAuth chưa được cấu hình đầy đủ.");
  return { clientId, clientSecret, callbackUrl };
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const cfg = googleClientConfig();
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || "Không thể làm mới quyền Google.");
  return data.access_token;
}

export function safeReturnUrl(status: "connected" | "error", detail = ""): string {
  const base = Deno.env.get("GOOGLE_OAUTH_RETURN_URL") || "https://vinhmath.com/quan-tri-video-meet";
  const url = new URL(base);
  url.searchParams.set("google", status);
  if (detail) url.searchParams.set("message", detail.slice(0, 180));
  return url.toString();
}
