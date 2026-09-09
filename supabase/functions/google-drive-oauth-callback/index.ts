import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { encryptSecret, googleClientConfig, safeReturnUrl, sha256Hex } from "../_shared/google_oauth.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

Deno.serve(async (request: Request) => {
  let purpose='meet';
  const back=(status:'connected'|'error',detail='')=>purpose==='vmtools'?'https://vinhmath.com/vmtools-drive-connected?google='+status:safeReturnUrl(status,detail);
  try {
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const oauthError = url.searchParams.get("error");
    if (!state) return Response.redirect(back("error", "Thiếu mã xác thực Google."), 302);

    const stateHash = await sha256Hex(state);
    const { data: saved, error: stateError } = await admin
      .from("google_oauth_states")
      .select("state_hash,user_id,expires_at,used_at,purpose")
      .eq("state_hash", stateHash)
      .maybeSingle();
    if (stateError || !saved || saved.used_at || new Date(saved.expires_at).getTime() < Date.now()) {
      return Response.redirect(safeReturnUrl("error", "Phiên kết nối đã hết hạn hoặc đã được sử dụng."), 302);
    }
    purpose=saved.purpose;
    const claimed=await admin.from('google_oauth_states').update({used_at:new Date().toISOString()}).eq('state_hash',stateHash).is('used_at',null).select('state_hash').maybeSingle();
    if(claimed.error||!claimed.data)throw Error('Phiên kết nối đã được sử dụng');
    if(oauthError||!code)return Response.redirect(back('error','Google không cấp quyền.'),302);
    const table=purpose==='vmtools'?'vmtools_drive_connections':'google_drive_connections';

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

    const existing = await admin.from(table).select("refresh_token_ciphertext").eq("user_id", saved.user_id).maybeSingle();
    const encryptedRefreshToken = tokens.refresh_token
      ? await encryptSecret(tokens.refresh_token)
      : existing.data?.refresh_token_ciphertext;
    if (!encryptedRefreshToken) throw new Error("Google không trả về quyền truy cập lâu dài. Hãy ngắt kết nối ứng dụng trong tài khoản Google rồi thử lại.");

    let googleEmail: string | null = null;
    const userInfo = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${tokens.access_token}` } });
    if (userInfo.ok) googleEmail = (await userInfo.json()).email || null;

    const scopes = String(tokens.scope || "").split(/\s+/).filter(Boolean);
    if(purpose==='vmtools'&&!scopes.includes('https://www.googleapis.com/auth/drive.file'))throw Error('Google chưa cấp quyền lưu bài giảng');
    const { error: upsertError } = await admin.from(table).upsert({
      user_id: saved.user_id,
      google_email: googleEmail,
      refresh_token_ciphertext: encryptedRefreshToken,
      granted_scopes: scopes,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (upsertError) throw upsertError;
    await admin.from("google_oauth_states").update({ used_at: new Date().toISOString() }).eq("state_hash", stateHash);
    return Response.redirect(back("connected"), 302);
  } catch (error) {
    console.error("google-drive-oauth-callback", 'OAuth connection failed');
    return Response.redirect(back("error", "Chưa liên kết được Google. Hãy thử lại."), 302);
  }
});
