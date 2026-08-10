import { createClient } from "npm:@supabase/supabase-js@2";
import { decryptSecret, DRIVE_METADATA_SCOPE, DRIVE_SCOPE, googleClientConfig, IDENTITY_SCOPES, randomToken, refreshAccessToken, sha256Hex } from "../_shared/google_oauth.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const allowedOrigins = new Set(["https://vinhmath.com", "https://www.vinhmath.com", "http://localhost:8000", "http://127.0.0.1:8000"]);

function cors(request: Request) {
  const origin = request.headers.get("origin") || "";
  return {
    "access-control-allow-origin": allowedOrigins.has(origin) ? origin : "https://vinhmath.com",
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    "vary": "Origin",
  };
}
function json(request: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...cors(request), "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function minutes(time: string | null): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function localParts(iso: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday: weekdayMap[parts.weekday], minute: Number(parts.hour) * 60 + Number(parts.minute) };
}
function meetCode(value: string | null | undefined): string {
  return (String(value || "").toLowerCase().match(/[a-z]{3}-[a-z]{4}-[a-z]{3}/) || [""])[0];
}

async function authenticatedStaff(request: Request) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("AUTH_REQUIRED");
  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) throw new Error("AUTH_REQUIRED");
  const { data: profile } = await admin.from("profiles").select("id,role,full_name").eq("id", authData.user.id).maybeSingle();
  if (!profile || !["admin", "teacher"].includes(profile.role)) throw new Error("FORBIDDEN");
  return profile;
}

async function connectionFor(userId: string) {
  const { data, error } = await admin.from("google_drive_connections").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function accessibleClassIds(profile: any): Promise<string[] | null> {
  if (profile.role === "admin") return null;
  const [{ data: owned }, { data: assisted }] = await Promise.all([
    admin.from("classes").select("id").or(`teacher_id.eq.${profile.id},co_teacher_id.eq.${profile.id}`),
    admin.from("class_assistants").select("class_id").eq("assistant_id", profile.id),
  ]);
  return Array.from(new Set([...(owned || []).map((x: any) => x.id), ...(assisted || []).map((x: any) => x.class_id)]));
}

async function syncRecordings(profile: any, days: number) {
  const userId = profile.id;
  const connection = await connectionFor(userId);
  if (!connection) throw new Error("Chưa kết nối tài khoản Google.");
  const refreshToken = await decryptSecret(connection.refresh_token_ciphertext);
  const accessToken = await refreshAccessToken(refreshToken);
  const since = new Date(Date.now() - Math.max(7, Math.min(days || 365, 3650)) * 86400000).toISOString();
  const files: any[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      q: `mimeType contains 'video/' and trashed = false and createdTime >= '${since}'`,
      spaces: "drive",
      corpora: "user",
      pageSize: "100",
      orderBy: "createdTime desc",
      fields: "nextPageToken,files(id,name,mimeType,trashed,createdTime,modifiedTime,webViewLink,size,videoMediaMetadata,capabilities(canShare))",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, { headers: { authorization: `Bearer ${accessToken}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Không thể đọc danh sách video Meet.");
    files.push(...(data.files || []).filter((file: any) => {
      const timestamp = file.createdTime || file.modifiedTime || "";
      return file.trashed !== true && String(file.mimeType || "").startsWith("video/") && timestamp >= since;
    }));
    pageToken = data.nextPageToken || "";
  } while (pageToken && files.length < 1000);

  const classIds = await accessibleClassIds(profile);
  let classesQuery = admin.from("classes").select("id,name,teacher_id,co_teacher_id");
  let schedulesQuery = admin.from("schedules").select("class_id,weekday,start_time,end_time,date,start_date,end_date,meet_link,teacher_id").eq("visible", true);
  let lessonsQuery = admin.from("lessons").select("id,class_id,title,created_at,youtube_url").gte("created_at", since).order("created_at", { ascending: false });
  if (classIds) {
    if (!classIds.length) return { count: 0, classes: 0 };
    classesQuery = classesQuery.in("id", classIds);
    schedulesQuery = schedulesQuery.in("class_id", classIds);
    lessonsQuery = lessonsQuery.in("class_id", classIds);
  }
  const [{ data: classes }, { data: schedules }, { data: lessons }] = await Promise.all([classesQuery, schedulesQuery, lessonsQuery]);
  const classMap = new Map((classes || []).map((c: any) => [c.id, c]));
  const now = new Date().toISOString();
  const rows = files.map((file) => {
    const lp = localParts(file.createdTime || file.modifiedTime);
    const code = meetCode(file.name);
    let best: any = null;
    for (const schedule of schedules || []) {
      let score = 0;
      const reasons: string[] = [];
      const scheduleCode = meetCode(schedule.meet_link);
      if (code && scheduleCode && code === scheduleCode) { score += 70; reasons.push("trùng mã Meet"); }
      const exactDate = schedule.date && schedule.date === lp.date;
      const recurringDate = !schedule.date && schedule.weekday === lp.weekday && (!schedule.start_date || lp.date >= schedule.start_date) && (!schedule.end_date || lp.date <= schedule.end_date);
      if (exactDate || recurringDate) { score += exactDate ? 35 : 25; reasons.push(exactDate ? "trùng ngày" : "trùng lịch tuần"); }
      const end = minutes(schedule.end_time) ?? minutes(schedule.start_time);
      if (end != null) {
        const diff = Math.abs(lp.minute - end);
        if (diff <= 180) { score += Math.max(5, 25 - Math.floor(diff / 15)); reasons.push("gần giờ học"); }
      }
      if (!best || score > best.score) best = { schedule, score, reasons };
    }
    const suggestedClassId = best && best.score >= 25 ? best.schedule.class_id : null;
    let suggestedLesson: any = null;
    if (suggestedClassId) {
      suggestedLesson = (lessons || []).find((l: any) => l.class_id === suggestedClassId && localParts(l.created_at).date === lp.date && !l.youtube_url)
        || (lessons || []).find((l: any) => l.class_id === suggestedClassId && !l.youtube_url);
    }
    let confidence = Math.min(100, best?.score || 0);
    const reasons = best?.reasons || [];
    if (suggestedLesson && localParts(suggestedLesson.created_at).date === lp.date) { confidence = Math.min(100, confidence + 20); reasons.push("có bài giảng cùng ngày"); }
    return {
      owner_user_id: userId,
      google_file_id: file.id,
      file_name: file.name || "Video Meet",
      mime_type: file.mimeType || null,
      created_time: file.createdTime || null,
      modified_time: file.modifiedTime || null,
      drive_url: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`,
      size_bytes: file.size ? Number(file.size) : null,
      duration_ms: file.videoMediaMetadata?.durationMillis ? Number(file.videoMediaMetadata.durationMillis) : null,
      width: file.videoMediaMetadata?.width || null,
      height: file.videoMediaMetadata?.height || null,
      suggested_class_id: suggestedClassId,
      suggested_lesson_id: suggestedLesson?.id || null,
      match_confidence: confidence,
      match_reason: reasons.join(", ") || "chưa đủ dữ kiện",
      sync_seen_at: now,
      updated_at: now,
    };
  });
  if (rows.length) {
    const { error } = await admin.from("meet_recordings").upsert(rows, { onConflict: "owner_user_id,google_file_id", ignoreDuplicates: false });
    if (error) throw error;
  }
  await admin.from("google_drive_connections").update({ last_synced_at: now, last_sync_count: rows.length, updated_at: now }).eq("user_id", userId);
  return { count: rows.length, classes: classMap.size };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  try {
    const profile = await authenticatedStaff(request);
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "status");
    if (action === "status") {
      const connection = await connectionFor(profile.id);
      return json(request, { connected: !!connection, google_email: connection?.google_email || null, last_synced_at: connection?.last_synced_at || null, last_sync_count: connection?.last_sync_count || 0 });
    }
    if (action === "auth-url") {
      const state = randomToken();
      const stateHash = await sha256Hex(state);
      await admin.from("google_oauth_states").delete().eq("user_id", profile.id);
      const { error } = await admin.from("google_oauth_states").insert({ state_hash: stateHash, user_id: profile.id, expires_at: new Date(Date.now() + 10 * 60000).toISOString() });
      if (error) throw error;
      const cfg = googleClientConfig();
      const params = new URLSearchParams({
        client_id: cfg.clientId,
        redirect_uri: cfg.callbackUrl,
        response_type: "code",
        scope: [...IDENTITY_SCOPES, DRIVE_SCOPE, DRIVE_METADATA_SCOPE].join(" "),
        access_type: "offline",
        include_granted_scopes: "true",
        prompt: "consent",
        state,
      });
      return json(request, { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
    }
    if (action === "sync") return json(request, { ok: true, ...(await syncRecordings(profile, Number(body.days) || 45)) });
    if (action === "assign") {
      const recordingId = String(body.recording_id || "");
      const lessonId = String(body.lesson_id || "");
      if (!recordingId || !lessonId) return json(request, { error: "Cần chọn video và bài giảng." }, 400);
      const { data: recording } = await admin.from("meet_recordings").select("id,drive_url").eq("id", recordingId).eq("owner_user_id", profile.id).maybeSingle();
      const { data: lesson } = await admin.from("lessons").select("id,class_id,youtube_url").eq("id", lessonId).maybeSingle();
      if (!recording || !lesson) return json(request, { error: "Video hoặc bài giảng không tồn tại." }, 404);
      const allowedClasses = await accessibleClassIds(profile);
      if (allowedClasses && !allowedClasses.includes(lesson.class_id)) return json(request, { error: "Không có quyền gắn video cho lớp này." }, 403);
      if (lesson.youtube_url && !body.overwrite) return json(request, { error: "Bài giảng đã có video.", code: "VIDEO_EXISTS" }, 409);
      const { error: lessonError } = await admin.from("lessons").update({ youtube_url: recording.drive_url }).eq("id", lesson.id);
      if (lessonError) throw lessonError;
      const { error: recordingError } = await admin.from("meet_recordings").update({ assigned_class_id: lesson.class_id, assigned_lesson_id: lesson.id, assigned_at: new Date().toISOString(), assigned_by: profile.id, updated_at: new Date().toISOString() }).eq("id", recording.id);
      if (recordingError) throw recordingError;
      return json(request, { ok: true });
    }
    if (action === "disconnect") {
      await admin.from("google_drive_connections").delete().eq("user_id", profile.id);
      await admin.from("google_oauth_states").delete().eq("user_id", profile.id);
      return json(request, { ok: true });
    }
    return json(request, { error: "Thao tác không hợp lệ." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi không xác định";
    const status = message === "AUTH_REQUIRED" ? 401 : message === "FORBIDDEN" ? 403 : 500;
    console.error("google-drive-video-manager", message);
    return json(request, { error: status === 500 ? message : "Không có quyền truy cập." }, status);
  }
});
