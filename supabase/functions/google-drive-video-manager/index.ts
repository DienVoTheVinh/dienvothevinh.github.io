import { createClient } from "npm:@supabase/supabase-js@2";
import {
  decryptSecret, DRIVE_METADATA_SCOPE, DRIVE_SCOPE, googleClientConfig, IDENTITY_SCOPES,
  MEET_SPACE_SCOPE, randomToken, refreshAccessToken, sha256Hex,
} from "../_shared/google_oauth.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const allowedOrigins = new Set(["https://vinhmath.com", "https://www.vinhmath.com", "http://localhost:8000", "http://127.0.0.1:8000"]);
const DAY_MS = 86_400_000;
const AUTO_SYNC_STALE_MS = 10 * 60_000;

function cors(request: Request) {
  const origin = request.headers.get("origin") || "";
  return {
    "access-control-allow-origin": allowedOrigins.has(origin) ? origin : "https://vinhmath.com",
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS", vary: "Origin",
  };
}
function json(request: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...cors(request), "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}
function safeError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || "Lỗi không xác định");
  return raw.replace(/https?:\/\/\S+/gi, "[url]").replace(/[A-Za-z0-9_-]{32,}/g, "[redacted]").replace(/[\w.+-]+@[\w.-]+/g, "[email]").slice(0, 300);
}
function minutes(time: string | null): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(time || "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
function localParts(iso: string | null | undefined) {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return { date: "", weekday: 0, minute: 0 };
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short" });
  const parts = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  const weekdays: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { date: `${parts.year}-${parts.month}-${parts.day}`, weekday: weekdays[parts.weekday] || 0, minute: Number(parts.hour) * 60 + Number(parts.minute) };
}
function meetCode(value: string | null | undefined): string {
  return (String(value || "").toLowerCase().match(/[a-z]{3}-[a-z]{4}-[a-z]{3}/) || [""])[0];
}
function words(value: unknown) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/)
    .filter((word) => word.length >= 2 && !["video", "recording", "google", "meet", "buoi", "hoc"].includes(word));
}
function sharedWordScore(left: unknown, right: unknown, max = 24) {
  const a = new Set(words(left)); const b = new Set(words(right)); let matches = 0;
  for (const word of a) if (b.has(word)) matches++;
  return Math.min(max, matches * 8);
}
function dayDistance(left: string, right: string) {
  const a = new Date(`${left}T12:00:00+07:00`).getTime(), b = new Date(`${right}T12:00:00+07:00`).getTime();
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((a - b) / DAY_MS) : 9999;
}

async function authenticatedStaff(request: Request) {
  const auth = request.headers.get("authorization") || "", token = auth.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("AUTH_REQUIRED");
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data: authData, error: authError } = await client.auth.getUser(token);
  if (authError || !authData.user) throw new Error("AUTH_REQUIRED");
  const { data: profile } = await admin.from("profiles").select("id,role,full_name").eq("id", authData.user.id).maybeSingle();
  if (!profile || !["admin", "teacher"].includes(profile.role)) throw new Error("FORBIDDEN");
  return profile;
}
async function connectionFor(userId: string) {
  const { data, error } = await admin.from("google_drive_connections").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error; return data;
}
async function accessibleClassIds(profile: any): Promise<string[] | null> {
  if (profile.role === "admin") return null;
  const [{ data: owned }, { data: assisted }] = await Promise.all([
    admin.from("classes").select("id").or(`teacher_id.eq.${profile.id},co_teacher_id.eq.${profile.id}`),
    admin.from("class_assistants").select("class_id").eq("assistant_id", profile.id),
  ]);
  return Array.from(new Set([...(owned || []).map((item: any) => item.id), ...(assisted || []).map((item: any) => item.class_id)]));
}
async function teachingData(profile: any, since: string) {
  const classIds = await accessibleClassIds(profile);
  let classesQuery = admin.from("classes").select("id,name,grade,teacher_id,co_teacher_id").order("grade").order("name");
  let schedulesQuery = admin.from("schedules").select("class_id,weekday,start_time,end_time,date,start_date,end_date,meet_link,teacher_id").eq("visible", true);
  let lessonsQuery = admin.from("lessons").select("id,class_id,title,created_at,youtube_url,published").gte("created_at", since).order("created_at", { ascending: false });
  if (classIds) {
    if (!classIds.length) return { classes: [], schedules: [], lessons: [], classIds };
    classesQuery = classesQuery.in("id", classIds); schedulesQuery = schedulesQuery.in("class_id", classIds); lessonsQuery = lessonsQuery.in("class_id", classIds);
  }
  const [classesResult, schedulesResult, lessonsResult] = await Promise.all([classesQuery, schedulesQuery, lessonsQuery]);
  if (classesResult.error) throw classesResult.error; if (schedulesResult.error) throw schedulesResult.error; if (lessonsResult.error) throw lessonsResult.error;
  return { classes: classesResult.data || [], schedules: schedulesResult.data || [], lessons: lessonsResult.data || [], classIds };
}

function scheduleScore(recording: any, schedule: any) {
  const parts = localParts(recording.conference_start_time || recording.created_time || recording.modified_time);
  if (!parts.date) return { score: 0, reasons: [] as string[] };
  let score = 0; const reasons: string[] = [];
  const recordingCode = meetCode(recording.file_name), scheduleCode = meetCode(schedule.meet_link);
  if (recordingCode && scheduleCode && recordingCode === scheduleCode) { score += 68; reasons.push("trùng mã Meet"); }
  const exactDate = schedule.date && schedule.date === parts.date;
  const recurringDate = !schedule.date && Number(schedule.weekday) === parts.weekday && (!schedule.start_date || parts.date >= schedule.start_date) && (!schedule.end_date || parts.date <= schedule.end_date);
  if (exactDate || recurringDate) { score += exactDate ? 34 : 24; reasons.push(exactDate ? "trùng ngày lịch" : "đúng lịch tuần"); }
  const end = minutes(schedule.end_time) ?? minutes(schedule.start_time);
  if (end != null) { const diff = Math.abs(parts.minute - end); if (diff <= 240) { score += Math.max(4, 24 - Math.floor(diff / 15)); reasons.push("gần giờ kết thúc buổi học"); } }
  return { score, reasons };
}
function rankCandidates(recording: any, classes: any[], schedules: any[], lessons: any[]) {
  const classMap = new Map(classes.map((item: any) => [item.id, item]));
  const recordDate = localParts(recording.conference_start_time || recording.created_time || recording.modified_time).date;
  const ranked: any[] = [];
  for (const lesson of lessons) {
    if (lesson.youtube_url) continue;
    const classroom: any = classMap.get(lesson.class_id); if (!classroom) continue;
    let bestSchedule = { score: 0, reasons: [] as string[] };
    for (const schedule of schedules) { if (schedule.class_id !== lesson.class_id) continue; const candidate = scheduleScore(recording, schedule); if (candidate.score > bestSchedule.score) bestSchedule = candidate; }
    let score = bestSchedule.score; const reasons = [...bestSchedule.reasons];
    const lessonDate = localParts(lesson.created_at).date, distance = dayDistance(recordDate, lessonDate);
    if (distance === 0) { score += 28; reasons.push("bài giảng tạo cùng ngày"); }
    else if (distance >= 1 && distance <= 7) { score += Math.max(8, 22 - (distance - 1) * 3); reasons.push(`bài giảng trước buổi học ${distance} ngày`); }
    else if (distance < 0 && distance >= -2) { score += 8; reasons.push("bài giảng tạo sát sau buổi học"); }
    const classWords = sharedWordScore(recording.file_name, classroom.name, 20), titleWords = sharedWordScore(recording.file_name, lesson.title, 24);
    if (classWords) { score += classWords; reasons.push("tên video khớp lớp"); }
    if (titleWords) { score += titleWords; reasons.push("tên video khớp bài"); }
    if (score < 20) continue;
    ranked.push({ lesson_id: lesson.id, class_id: lesson.class_id, lesson_title: lesson.title, class_name: classroom.name, confidence: Math.min(100, score), reason: Array.from(new Set(reasons)).slice(0, 4).join(", ") });
  }
  return ranked.sort((a, b) => b.confidence - a.confidence || String(b.lesson_title).localeCompare(String(a.lesson_title), "vi")).slice(0, 5);
}

async function catalogFor(profile: any) {
  const teaching = await teachingData(profile, new Date(Date.now() - 3650 * DAY_MS).toISOString());
  if (teaching.classIds && !teaching.classIds.length) return { classes: [], lessons: [], recordings: [], coverage: [], summary: { lessons_missing: 0, recommended: 0, processing: 0 } };
  const { data: rawRecordings, error } = await admin.from("meet_recordings").select("*").eq("owner_user_id", profile.id).eq("is_meet_recording", true).order("created_time", { ascending: false, nullsFirst: false }).limit(1500);
  if (error) throw error;
  const recordings = (rawRecordings || []).map((recording: any) => {
    const suggestions = recording.assigned_lesson_id ? [] : rankCandidates(recording, teaching.classes, teaching.schedules, teaching.lessons), best = suggestions[0] || null;
    return { ...recording, suggested_class_id: best?.class_id || recording.suggested_class_id, suggested_lesson_id: best?.lesson_id || recording.suggested_lesson_id, match_confidence: best?.confidence ?? recording.match_confidence, match_reason: best?.reason || recording.match_reason, suggestions, ready: recording.recording_state === "FILE_GENERATED" && !!recording.drive_url };
  });
  const recommendationByLesson = new Map<string, any>();
  for (const recording of recordings) {
    if (recording.assigned_lesson_id || !recording.ready) continue;
    for (const suggestion of recording.suggestions || []) { const previous = recommendationByLesson.get(suggestion.lesson_id); if (!previous || suggestion.confidence > previous.confidence) recommendationByLesson.set(suggestion.lesson_id, { recording_id: recording.id, recording_name: recording.file_name, confidence: suggestion.confidence, reason: suggestion.reason }); }
  }
  const coverage = teaching.classes.map((classroom: any) => {
    const classLessons = teaching.lessons.filter((lesson: any) => lesson.class_id === classroom.id);
    const missing = classLessons.filter((lesson: any) => !lesson.youtube_url).map((lesson: any) => ({ id: lesson.id, title: lesson.title, created_at: lesson.created_at, recommendation: recommendationByLesson.get(lesson.id) || null }));
    return { class_id: classroom.id, class_name: classroom.name, grade: classroom.grade, total: classLessons.length, missing_count: missing.length, ready_count: classLessons.length - missing.length, missing };
  }).sort((a: any, b: any) => b.missing_count - a.missing_count || String(a.class_name).localeCompare(String(b.class_name), "vi"));
  return { classes: teaching.classes, lessons: teaching.lessons, recordings, coverage, summary: { lessons_missing: coverage.reduce((total: number, item: any) => total + item.missing_count, 0), recommended: recommendationByLesson.size, processing: recordings.filter((item: any) => !item.ready).length } };
}

function likelyMeetFile(file: any, scheduleCodes: Set<string>) {
  if (file.trashed === true || !String(file.mimeType || "").startsWith("video/")) return false;
  const name = String(file.name || ""), code = meetCode(name);
  if (code && (!scheduleCodes.size || scheduleCodes.has(code))) return true;
  if (code) return true;
  return /(^|\W)(recording|bản ghi)(\W|$)/iu.test(name);
}
async function fetchJson(url: string, accessToken: string) {
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `Google API trả về ${response.status}.`);
  return data;
}
async function fetchDriveCandidates(accessToken: string, since: string, changedSince: string, scheduleCodes: Set<string>) {
  const files: any[] = []; let pageToken = "", scanned = 0, incomplete = false;
  do {
    const params = new URLSearchParams({ q: `mimeType contains 'video/' and trashed = false and (createdTime >= '${since}' or modifiedTime >= '${changedSince}')`, spaces: "drive", corpora: "user", pageSize: "100", orderBy: "modifiedTime desc", fields: "nextPageToken,files(id,name,mimeType,trashed,createdTime,modifiedTime,webViewLink,size,videoMediaMetadata)" });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await fetchJson(`https://www.googleapis.com/drive/v3/files?${params}`, accessToken), page = data.files || [];
    scanned += page.length; files.push(...page.filter((file: any) => likelyMeetFile(file, scheduleCodes))); pageToken = data.nextPageToken || "";
    if (scanned >= 5000 && pageToken) { incomplete = true; break; }
  } while (pageToken);
  return { files, scanned, incomplete };
}
async function mapConcurrent<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const result = new Array<R>(items.length); let cursor = 0;
  async function worker() { while (cursor < items.length) { const index = cursor++; result[index] = await mapper(items[index]); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker())); return result;
}
async function fetchMeetArtifacts(accessToken: string, since: string) {
  const conferences: any[] = []; let pageToken = "";
  do { const params = new URLSearchParams({ pageSize: "100", filter: `start_time>=\"${since}\"` }); if (pageToken) params.set("pageToken", pageToken); const data = await fetchJson(`https://meet.googleapis.com/v2/conferenceRecords?${params}`, accessToken); conferences.push(...(data.conferenceRecords || [])); pageToken = data.nextPageToken || ""; } while (pageToken && conferences.length < 500);
  const pages = await mapConcurrent(conferences, 6, async (conference: any) => { const data = await fetchJson(`https://meet.googleapis.com/v2/${conference.name}/recordings?pageSize=100`, accessToken); return (data.recordings || []).map((recording: any) => ({ ...recording, conference })); });
  return pages.flat();
}
async function driveMetadata(accessToken: string, fileId: string) {
  const params = new URLSearchParams({ fields: "id,name,mimeType,createdTime,modifiedTime,webViewLink,size,videoMediaMetadata" });
  return fetchJson(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?${params}`, accessToken);
}
async function upsertChunks(rows: any[], onConflict: string) {
  for (let index = 0; index < rows.length; index += 100) { const { error } = await admin.from("meet_recordings").upsert(rows.slice(index, index + 100), { onConflict, ignoreDuplicates: false }); if (error) throw error; }
}

async function syncRecordings(profile: any, days: number, mode: string) {
  const userId = profile.id, connection = await connectionFor(userId);
  if (!connection) throw new Error("Chưa kết nối tài khoản Google.");
  if (connection.last_sync_status === "running" && connection.last_sync_started_at && Date.now() - new Date(connection.last_sync_started_at).getTime() < 4 * 60_000) throw new Error("SYNC_ALREADY_RUNNING");
  const startedAt = new Date().toISOString();
  await admin.from("google_drive_connections").update({ last_sync_started_at: startedAt, last_sync_status: "running", last_sync_error: null, last_sync_mode: mode, updated_at: startedAt }).eq("user_id", userId);
  try {
    const accessToken = await refreshAccessToken(await decryptSecret(connection.refresh_token_ciphertext));
    const rangeDays = Math.max(7, Math.min(days || 90, 3650)), since = new Date(Date.now() - rangeDays * DAY_MS).toISOString();
    const lastSyncMs = connection.last_synced_at ? new Date(connection.last_synced_at).getTime() : 0;
    const changedSince = new Date(Math.max(Date.now() - rangeDays * DAY_MS, lastSyncMs - 2 * DAY_MS)).toISOString();
    const teaching = await teachingData(profile, since), scheduleCodes = new Set<string>((teaching.schedules || []).map((item: any) => meetCode(item.meet_link)).filter(Boolean));
    const driveResult = await fetchDriveCandidates(accessToken, since, changedSince, scheduleCodes), now = new Date().toISOString();
    const driveRows = driveResult.files.map((file: any) => {
      const draft = { file_name: file.name || "Video Meet", created_time: file.createdTime || file.modifiedTime || null, modified_time: file.modifiedTime || null, conference_start_time: null };
      const best = rankCandidates(draft, teaching.classes, teaching.schedules, teaching.lessons)[0] || null;
      return { owner_user_id: userId, google_file_id: file.id, file_name: file.name || "Video Meet", mime_type: file.mimeType || null, created_time: file.createdTime || null, modified_time: file.modifiedTime || null, drive_url: file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`, size_bytes: file.size ? Number(file.size) : null, duration_ms: file.videoMediaMetadata?.durationMillis ? Number(file.videoMediaMetadata.durationMillis) : null, width: file.videoMediaMetadata?.width || null, height: file.videoMediaMetadata?.height || null, suggested_class_id: best?.class_id || null, suggested_lesson_id: best?.lesson_id || null, match_confidence: best?.confidence || 0, match_reason: best?.reason || "chưa đủ dữ kiện", source: "drive_scan", recording_state: "FILE_GENERATED", is_meet_recording: true, sync_seen_at: now, updated_at: now };
    });
    if (driveRows.length) await upsertChunks(driveRows, "owner_user_id,google_file_id");
    const scopes = new Set<string>(connection.granted_scopes || []); let meetMatched = 0, meetApiAvailable = scopes.has(MEET_SPACE_SCOPE), meetApiWarning = "";
    if (meetApiAvailable) {
      try {
        const artifacts = await fetchMeetArtifacts(accessToken, new Date(Date.now() - Math.min(rangeDays, 30) * DAY_MS).toISOString());
        const generated = artifacts.filter((item: any) => item.driveDestination?.file);
        const metadata = await mapConcurrent(generated, 6, async (item: any) => { try { return await driveMetadata(accessToken, item.driveDestination.file); } catch { return null; } });
        const metadataById = new Map(generated.map((item: any, index: number) => [item.driveDestination.file, metadata[index]]));
        for (const item of artifacts) if (item.driveDestination?.file) await admin.from("meet_recordings").update({ google_recording_name: item.name }).eq("owner_user_id", userId).eq("google_file_id", item.driveDestination.file).is("google_recording_name", null);
        const meetRows = await Promise.all(artifacts.map(async (item: any) => {
          const fileId = item.driveDestination?.file || "", file: any = fileId ? metadataById.get(fileId) : null;
          const draft = { file_name: file?.name || "Bản ghi Google Meet đang xử lý", created_time: file?.createdTime || item.startTime || item.conference.startTime, modified_time: file?.modifiedTime || item.endTime || item.conference.endTime, conference_start_time: item.startTime || item.conference.startTime };
          const best = rankCandidates(draft, teaching.classes, teaching.schedules, teaching.lessons)[0] || null;
          return { owner_user_id: userId, google_file_id: fileId || `pending:${await sha256Hex(item.name)}`, google_recording_name: item.name, file_name: file?.name || "Bản ghi Google Meet đang xử lý", mime_type: file?.mimeType || "video/mp4", created_time: file?.createdTime || item.startTime || item.conference.startTime || null, modified_time: file?.modifiedTime || item.endTime || item.conference.endTime || null, drive_url: item.driveDestination?.exportUri || file?.webViewLink || "", size_bytes: file?.size ? Number(file.size) : null, duration_ms: file?.videoMediaMetadata?.durationMillis ? Number(file.videoMediaMetadata.durationMillis) : null, width: file?.videoMediaMetadata?.width || null, height: file?.videoMediaMetadata?.height || null, suggested_class_id: best?.class_id || null, suggested_lesson_id: best?.lesson_id || null, match_confidence: best?.confidence || 0, match_reason: best?.reason || "chưa đủ dữ kiện", source: "meet_api", recording_state: item.state || "ENDED", conference_start_time: item.startTime || item.conference.startTime || null, conference_end_time: item.endTime || item.conference.endTime || null, is_meet_recording: true, sync_seen_at: now, updated_at: now };
        }));
        if (meetRows.length) await upsertChunks(meetRows, "owner_user_id,google_recording_name"); meetMatched = meetRows.length;
      } catch (error) { meetApiAvailable = false; meetApiWarning = safeError(error); }
    }
    const matched = Math.max(driveRows.length, meetMatched);
    await admin.from("google_drive_connections").update({ last_synced_at: now, last_sync_count: matched, last_sync_status: "success", last_sync_error: meetApiWarning || null, last_sync_mode: mode, last_sync_scanned: driveResult.scanned, last_sync_matched: matched, updated_at: now }).eq("user_id", userId);
    return { count: matched, scanned: driveResult.scanned, drive_matched: driveRows.length, meet_matched: meetMatched, incomplete: driveResult.incomplete, enhanced: scopes.has(MEET_SPACE_SCOPE), meet_api_available: meetApiAvailable, warning: meetApiWarning || null };
  } catch (error) {
    await admin.from("google_drive_connections").update({ last_sync_status: "error", last_sync_error: safeError(error), updated_at: new Date().toISOString() }).eq("user_id", userId); throw error;
  }
}

async function assignLesson(profile: any, recordingId: string, lessonId: string, overwrite: boolean) {
  if (!recordingId || !lessonId) return { error: "Cần chọn video và bài giảng.", status: 400 };
  const [{ data: recording }, { data: lesson }] = await Promise.all([
    admin.from("meet_recordings").select("id,drive_url,recording_state,is_meet_recording").eq("id", recordingId).eq("owner_user_id", profile.id).maybeSingle(),
    admin.from("lessons").select("id,class_id,youtube_url").eq("id", lessonId).maybeSingle(),
  ]);
  if (!recording || !recording.is_meet_recording || !lesson) return { error: "Video hoặc bài giảng không tồn tại.", status: 404 };
  if (recording.recording_state !== "FILE_GENERATED" || !recording.drive_url) return { error: "Video vẫn đang được Google xử lý, chưa thể gắn.", status: 409, code: "VIDEO_PROCESSING" };
  const allowedClasses = await accessibleClassIds(profile);
  if (allowedClasses && !allowedClasses.includes(lesson.class_id)) return { error: "Không có quyền gắn video cho lớp này.", status: 403 };
  if (lesson.youtube_url && !overwrite) return { error: "Bài giảng đã có video.", code: "VIDEO_EXISTS", status: 409 };
  const { error: lessonError } = await admin.from("lessons").update({ youtube_url: recording.drive_url }).eq("id", lesson.id); if (lessonError) throw lessonError;
  const assignedAt = new Date().toISOString();
  const { error: recordingError } = await admin.from("meet_recordings").update({ assigned_class_id: lesson.class_id, assigned_lesson_id: lesson.id, assigned_at: assignedAt, assigned_by: profile.id, updated_at: assignedAt }).eq("id", recording.id).eq("owner_user_id", profile.id); if (recordingError) throw recordingError;
  return { ok: true, lesson_id: lesson.id };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors(request) });
  if (request.method !== "POST") return json(request, { error: "Method not allowed" }, 405);
  try {
    const profile = await authenticatedStaff(request), body = await request.json().catch(() => ({})), action = String(body.action || "status");
    if (action === "status") {
      const connection = await connectionFor(profile.id), scopes = new Set<string>(connection?.granted_scopes || []);
      return json(request, { connected: !!connection, google_email: connection?.google_email || null, last_synced_at: connection?.last_synced_at || null, last_sync_count: connection?.last_sync_count || 0, last_sync_status: connection?.last_sync_status || "idle", last_sync_error: connection?.last_sync_error || null, last_sync_scanned: connection?.last_sync_scanned || 0, last_sync_matched: connection?.last_sync_matched || 0, enhanced_access: scopes.has(MEET_SPACE_SCOPE), stale: !connection?.last_synced_at || Date.now() - new Date(connection.last_synced_at).getTime() > AUTO_SYNC_STALE_MS });
    }
    if (action === "catalog") return json(request, await catalogFor(profile));
    if (action === "auth-url") {
      const state = randomToken(), stateHash = await sha256Hex(state); await admin.from("google_oauth_states").delete().eq("user_id", profile.id);
      const { error } = await admin.from("google_oauth_states").insert({ state_hash: stateHash, user_id: profile.id, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() }); if (error) throw error;
      const cfg = googleClientConfig(), params = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.callbackUrl, response_type: "code", scope: [...IDENTITY_SCOPES, DRIVE_SCOPE, DRIVE_METADATA_SCOPE, MEET_SPACE_SCOPE].join(" "), access_type: "offline", include_granted_scopes: "true", prompt: "consent", state });
      return json(request, { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
    }
    if (action === "sync") return json(request, { ok: true, ...(await syncRecordings(profile, Number(body.days) || 90, String(body.mode || "manual"))) });
    if (action === "assign") { const result = await assignLesson(profile, String(body.recording_id || ""), String(body.lesson_id || ""), !!body.overwrite); return json(request, result, result.status || 200); }
    if (action === "assign-best") {
      const recordingId = String(body.recording_id || ""), { data: recording } = await admin.from("meet_recordings").select("*").eq("id", recordingId).eq("owner_user_id", profile.id).eq("is_meet_recording", true).maybeSingle();
      if (!recording) return json(request, { error: "Không tìm thấy video." }, 404);
      const teaching = await teachingData(profile, new Date(Date.now() - 3650 * DAY_MS).toISOString());
      const ranked = rankCandidates(recording, teaching.classes, teaching.schedules, teaching.lessons);
      const expectedLessonId = String(body.expected_lesson_id || "");
      const selected = expectedLessonId ? ranked.find((item: any) => item.lesson_id === expectedLessonId) : ranked[0];
      if (!selected || selected.confidence < 60) return json(request, { error: "Gợi ý này chưa còn đủ chắc chắn để gắn một chạm.", code: "SUGGESTION_CHANGED" }, 409);
      const result = await assignLesson(profile, recordingId, selected.lesson_id, false); return json(request, result, result.status || 200);
    }
    if (action === "disconnect") { await admin.from("google_drive_connections").delete().eq("user_id", profile.id); await admin.from("google_oauth_states").delete().eq("user_id", profile.id); return json(request, { ok: true }); }
    return json(request, { error: "Thao tác không hợp lệ." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi không xác định", status = message === "AUTH_REQUIRED" ? 401 : message === "FORBIDDEN" ? 403 : message === "SYNC_ALREADY_RUNNING" ? 409 : 500;
    console.error("google-drive-video-manager", safeError(error));
    return json(request, { error: status === 401 || status === 403 ? "Không có quyền truy cập." : status === 409 ? "Đang có một lượt đồng bộ khác chạy. Vui lòng chờ ít phút." : safeError(error), code: message === "SYNC_ALREADY_RUNNING" ? message : undefined }, status);
  }
});
