import { createClient } from "npm:@supabase/supabase-js@2";
import { encryptSecret, googleClientConfig, safeReturnUrl, sha256Hex } from "../_shared/google_oauth.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

Deno.serve(async (request: Request) => {
  try {
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");
    if (oauthError) return Response.redirect(safeReturnUrl("error", "Google không cấp quyền."), 302);
    if (!code || !state) return Response.redirect(safeReturnUrl("error", "Thiếu mã xác thực Google."), 302);

    const stateHash = await sha256Hex(state);
    const { data: saved, error: stateError } = await admin
      .from("google_oauth_states")
      .select("state_hash,user_id,expires_at,used_at")
      .eq("state_hash", stateHash)
      .maybeSingle();
    if (stateError || !saved || saved.used_at || new Date(saved.expires_at).getTime() < Date.now()) {
      return Response.redirect(safeReturnUrl("error", "Phiên kết nối đã hết hạn hoặc đã được sử dụng."), 302);
    }

    const cfg = googleClientConfig();
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: cfg.callbackUrl,
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok || !tokens.access_token) throw new Error(tokens.error_description || tokens.error || "Đổi mã OAuth thất bại.");

    const existing = await admin.from("google_drive_connections").select("refresh_token_ciphertext").eq("user_id", saved.user_id).maybeSingle();
    const encryptedRefreshToken = tokens.refresh_token
      ? await encryptSecret(tokens.refresh_token)
      : existing.data?.refresh_token_ciphertext;
    if (!encryptedRefreshToken) throw new Error("Google không trả về quyền truy cập lâu dài. Hãy ngắt kết nối ứng dụng trong tài khoản Google rồi thử lại.");

    let googleEmail: string | null = null;
    const userInfo = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${tokens.access_token}` } });
    if (userInfo.ok) googleEmail = (await userInfo.json()).email || null;

    const scopes = String(tokens.scope || "").split(/\s+/).filter(Boolean);
    const { error: upsertError } = await admin.from("google_drive_connections").upsert({
      user_id: saved.user_id,
      google_email: googleEmail,
      refresh_token_ciphertext: encryptedRefreshToken,
      granted_scopes: scopes,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (upsertError) throw upsertError;
    await admin.from("google_oauth_states").update({ used_at: new Date().toISOString() }).eq("state_hash", stateHash);
    return Response.redirect(safeReturnUrl("connected"), 302);
  } catch (error) {
    console.error("google-drive-oauth-callback", error instanceof Error ? error.message : error);
    return Response.redirect(safeReturnUrl("error", error instanceof Error ? error.message : "Lỗi kết nối Google."), 302);
  }
});
