import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "content-type, content-length",
};

const LOAI_HOP_LE = new Set(["homework", "homework_bonus", "test"]);
const DAP_AN_MIME_HOP_LE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);
const MAX_FILES = 12;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_TEX_BYTES = 200000;
const UPLOAD_CONCURRENCY = 3;
const folderCache = new Map<string, string>();

function traJson(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function tenAnToan(value: unknown, fallback: string) {
  const text = String(value || fallback).replace(/[\u0000-\u001f/\\]/g, "-").trim();
  return (text || fallback).slice(0, 160);
}

function loi(message: string, status: number) {
  const error = new Error(message);
  (error as any).status = status;
  return error;
}

async function fetchJson(url: string, init: RequestInit, moTa: string, timeoutMs: number, retryGet = 0): Promise<any> {
  let lan = 0;
  while (true) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const raw = await response.text();
      let data: any = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { data = { message: raw }; }
      if (!response.ok) {
        const err = new Error(`${moTa}: HTTP ${response.status} - ${data.error?.message || data.message || raw || "không rõ lỗi"}`);
        (err as any).status = response.status;
        throw err;
      }
      return data;
    } catch (error) {
      const status = Number((error as any)?.status || 0);
      const coTheThuLai = (init.method || "GET") === "GET" && (status === 408 || status === 429 || status >= 500 || (error as Error)?.name === "AbortError");
      if (coTheThuLai && lan < retryGet) { lan++; continue; }
      if ((error as Error)?.name === "AbortError") throw new Error(`${moTa}: quá thời gian chờ máy chủ ngoài`);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

async function googleToken(): Promise<string> {
  const data = await fetchJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID") || "",
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET") || "",
      refresh_token: Deno.env.get("GOOGLE_REFRESH_TOKEN") || "",
      grant_type: "refresh_token",
    }),
  }, "Không lấy được quyền truy cập Google Drive", 20000);
  if (!data.access_token) throw new Error("Google Drive không trả access token. Cần kết nối lại tài khoản Drive.");
  return data.access_token;
}

async function timHoacTaoThuMuc(token: string, ten: string, chaId?: string): Promise<string> {
  const safeName = tenAnToan(ten, "Chưa đặt tên");
  const cacheKey = `${chaId || "root"}/${safeName}`;
  const cached = folderCache.get(cacheKey);
  if (cached) return cached;

  const q = "name='" + safeName.replace(/'/g, "\\'") + "' and mimeType='application/vnd.google-apps.folder' and trashed=false" + (chaId ? " and '" + chaId + "' in parents" : "");
  const found = await fetchJson("https://www.googleapis.com/drive/v3/files?q=" + encodeURIComponent(q) + "&fields=files(id)", {
    headers: { Authorization: "Bearer " + token },
  }, `Không tìm được thư mục “${safeName}”`, 20000, 1);
  if (found.files?.length) {
    folderCache.set(cacheKey, found.files[0].id);
    return found.files[0].id;
  }

  const created = await fetchJson("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ name: safeName, mimeType: "application/vnd.google-apps.folder", ...(chaId ? { parents: [chaId] } : {}) }),
  }, `Không tạo được thư mục “${safeName}”`, 25000);
  if (!created.id) throw new Error(`Google Drive không trả ID thư mục “${safeName}”.`);
  folderCache.set(cacheKey, created.id);
  return created.id;
}

async function xoaFileDrive(token: string, id: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    await fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(id), {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
      signal: controller.signal,
    });
  } catch { /* dọn best-effort */ } finally { clearTimeout(timer); }
}

async function taiLenDrive(token: string, file: File, thuMucId: string, ten: string, congKhai = true) {
  const fd = new FormData();
  fd.append("metadata", new Blob([JSON.stringify({ name: tenAnToan(ten, file.name), parents: [thuMucId] })], { type: "application/json" }));
  fd.append("file", file);
  const uploaded = await fetchJson("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,mimeType,size", {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: fd,
  }, `Không tải được tệp “${file.name}” lên Drive`, 55000);
  if (!uploaded.id) throw new Error(`Google Drive không trả ID cho tệp “${file.name}”.`);
  if (congKhai) {
    try {
      await fetchJson("https://www.googleapis.com/drive/v3/files/" + uploaded.id + "/permissions", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ role: "reader", type: "anyone" }),
      }, `Không cấp được quyền xem tệp “${file.name}”`, 20000);
    } catch (error) {
      await xoaFileDrive(token, uploaded.id);
      throw error;
    }
  }
  return {
    id: uploaded.id,
    name: uploaded.name,
    ...(congKhai ? { link: uploaded.webViewLink } : {}),
    mime_type: uploaded.mimeType || file.type || "application/octet-stream",
    size: Number(uploaded.size || file.size || 0),
  };
}

async function taiFileDrive(token: string, id: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);
  try {
    const response = await fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(id) + "?alt=media", {
      headers: { Authorization: "Bearer " + token },
      signal: controller.signal,
    });
    if (!response.ok) throw loi(`Không tải được tệp đáp án: HTTP ${response.status}.`, response.status === 404 ? 404 : 502);
    return response;
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw loi("Quá thời gian tải tệp đáp án.", 504);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function taiNhieuFile(token: string, files: File[], thuMucId: string, prefix: string, congKhai = true) {
  if (files.length > MAX_FILES) throw new Error(`Mỗi lần chỉ nộp tối đa ${MAX_FILES} tệp.`);
  let total = 0;
  for (const file of files) {
    if (!(file instanceof File) || !file.name) throw new Error("Danh sách tệp không hợp lệ.");
    if (file.size > MAX_FILE_BYTES) throw new Error(`Tệp “${file.name}” lớn hơn 15 MB.`);
    total += file.size;
  }
  if (total > MAX_TOTAL_BYTES) throw new Error("Tổng dung lượng tệp lớn hơn 50 MB.");

  const results: any[] = new Array(files.length);
  const errors: Error[] = [];
  let nextIndex = 0;
  let stopped = false;
  async function worker() {
    while (!stopped) {
      const index = nextIndex++;
      if (index >= files.length) return;
      try {
        results[index] = await taiLenDrive(token, files[index], thuMucId, prefix + files[index].name, congKhai);
      } catch (error) {
        errors.push(error as Error);
        stopped = true;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, () => worker()));
  if (errors.length) {
    await Promise.all(results.filter(Boolean).map((item) => xoaFileDrive(token, item.id)));
    throw errors[0];
  }
  return results;
}

function thuMucLoaiTen(kind: string): string {
  if (kind === "test") return "Kiểm tra";
  if (kind === "homework_bonus") return "Bài tập thưởng thêm";
  return "Bài tập về nhà";
}

function coMang(value: unknown) { return Array.isArray(value) && value.length > 0; }

async function coQuyenQuanLyLop(svc: any, userId: string, role: string, classId: string | null) {
  if (role === "admin") return true;
  if (!classId) return false;
  const { data: lop } = await svc.from("classes").select("teacher_id, co_teacher_id").eq("id", classId).single();
  if (lop && (lop.teacher_id === userId || lop.co_teacher_id === userId)) return true;
  const { data: troGiang } = await svc.from("class_assistants").select("class_id").eq("class_id", classId).eq("assistant_id", userId).maybeSingle();
  return !!troGiang;
}

async function xacNhanHocSinhTrongLop(svc: any, studentId: string, classId: string | null) {
  if (!classId) return;
  const { data } = await svc.from("class_students").select("student_id").eq("class_id", classId).eq("student_id", studentId).maybeSingle();
  if (!data) throw new Error("Học sinh không thuộc lớp của bài đã chọn.");
}

function docDanhSachId(value: FormDataEntryValue | null) {
  if (!value) return [] as string[];
  try {
    const parsed = JSON.parse(String(value));
    if (!Array.isArray(parsed)) return [] as string[];
    return [...new Set(parsed.map((id) => String(id || "").trim()).filter(Boolean))];
  } catch {
    throw loi("Danh sách tệp đáp án không hợp lệ.", 400);
  }
}

function mimeDapAnAnToan(file: File) {
  const mime = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  const mimeTheoDuoi = name.endsWith(".pdf") ? "application/pdf"
    : name.endsWith(".png") ? "image/png"
    : name.endsWith(".webp") ? "image/webp"
    : name.endsWith(".gif") ? "image/gif"
    : /\.jpe?g$/.test(name) ? "image/jpeg"
    : "";
  if (DAP_AN_MIME_HOP_LE.has(mime)) return mime;
  if (mimeTheoDuoi) return mimeTheoDuoi;
  throw loi(`Tệp “${file.name}” không phải ảnh hoặc PDF.`, 400);
}

function kiemTraTepDapAn(files: File[]) {
  for (const file of files) {
    mimeDapAnAnToan(file);
  }
}

async function coQuyenXemDapAn(svc: any, userId: string, role: string, lesson: any) {
  if (["admin", "teacher", "assistant"].includes(role)) {
    return await coQuyenQuanLyLop(svc, userId, role, lesson.class_id);
  }
  if (role !== "student") return false;
  const { data: graded } = await svc.from("submissions")
    .select("id")
    .eq("lesson_id", lesson.id)
    .eq("student_id", userId)
    .eq("status", "graded")
    .not("submitted_at", "is", null)
    .limit(1);
  return !!graded?.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return traJson({ error: "Phiên đăng nhập không hợp lệ." }, 401);
    const { data: prof } = await svc.from("profiles").select("username, full_name, role").eq("id", user.id).single();
    if (!prof) throw new Error("Không tìm thấy hồ sơ người dùng.");

    const form = await req.formData();
    const action = String(form.get("kind") || "nop");
    const phanloai = String(form.get("phanloai") || "");
    const files = form.getAll("files").filter((item): item is File => item instanceof File);
    const canKhongCanTep = new Set(["xoa_cham", "class_answer_get", "class_answer_file", "class_answer_delete", "class_answer_save"]);
    if (!canKhongCanTep.has(action) && !files.length) throw loi("Chưa chọn tệp nào.", 400);

    const canGoogle = action !== "class_answer_get";
    const token = canGoogle ? await googleToken() : "";
    const canThuMucNopBai = action === "nop" || action === "cham";
    const goc = canThuMucNopBai ? await timHoacTaoThuMuc(token, "VINHMATH NOP BAI") : "";
    const ngay = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

    if (action.startsWith("class_answer_")) {
      const lessonId = String(form.get("lesson_id") || "").trim();
      if (!lessonId) throw loi("Chưa chọn bài giảng để quản lý đáp án.", 400);
      const { data: lesson, error: lessonError } = await svc.from("lessons")
        .select("id, title, class_id, classes(name, grade, is_specialized)")
        .eq("id", lessonId)
        .single();
      if (lessonError || !lesson) throw loi("Không tìm thấy bài giảng đã chọn.", 404);

      const duocQuanLy = ["admin", "teacher", "assistant"].includes(prof.role)
        && await coQuyenQuanLyLop(svc, user.id, prof.role, lesson.class_id);
      const duocXem = duocQuanLy || await coQuyenXemDapAn(svc, user.id, prof.role, lesson);

      if (action === "class_answer_get") {
        if (!duocXem) throw loi("Đáp án chỉ mở sau khi bài của em đã được giáo viên chấm.", 403);
        const { data: answer, error: answerError } = await svc.from("class_lesson_answers")
          .select("id, lesson_id, tex_content, files, updated_at")
          .eq("lesson_id", lessonId)
          .maybeSingle();
        if (answerError) throw new Error("Không tải được đáp án chung: " + answerError.message);
        return traJson({ ok: true, can_edit: duocQuanLy, answer: answer || null });
      }

      if (action === "class_answer_file") {
        if (!duocXem) throw loi("Đáp án chỉ mở sau khi bài của em đã được giáo viên chấm.", 403);
        const fileId = String(form.get("file_id") || "").trim();
        if (!fileId) throw loi("Thiếu mã tệp đáp án.", 400);
        const { data: answer } = await svc.from("class_lesson_answers")
          .select("files")
          .eq("lesson_id", lessonId)
          .maybeSingle();
        const answerFiles = Array.isArray(answer?.files) ? answer.files as any[] : [];
        const selected = answerFiles.find((item) => String(item?.id || "") === fileId);
        if (!selected) throw loi("Tệp không thuộc đáp án của bài giảng này.", 404);
        const driveResponse = await taiFileDrive(token, fileId);
        return new Response(driveResponse.body, {
          status: 200,
          headers: {
            ...cors,
            "Content-Type": String(selected.mime_type || driveResponse.headers.get("content-type") || "application/octet-stream"),
            "Cache-Control": "private, no-store, max-age=0",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }

      if (!duocQuanLy) throw loi("Thầy/cô không có quyền quản lý đáp án của lớp này.", 403);

      const { data: oldAnswer, error: oldError } = await svc.from("class_lesson_answers")
        .select("id, files, created_by")
        .eq("lesson_id", lessonId)
        .maybeSingle();
      if (oldError) throw new Error("Không đọc được đáp án hiện tại: " + oldError.message);
      const oldFiles = Array.isArray(oldAnswer?.files) ? oldAnswer.files as any[] : [];

      if (action === "class_answer_delete") {
        if (!oldAnswer) return traJson({ ok: true, deleted: false });
        const { error: deleteError } = await svc.from("class_lesson_answers").delete().eq("id", oldAnswer.id);
        if (deleteError) throw new Error("Không xóa được đáp án: " + deleteError.message);
        await Promise.all(oldFiles.map((item) => String(item?.id || "")).filter(Boolean).map((id) => xoaFileDrive(token, id)));
        return traJson({ ok: true, deleted: true });
      }

      if (action !== "class_answer_save") throw loi("Thao tác đáp án không hợp lệ.", 400);
      kiemTraTepDapAn(files);
      const texContent = String(form.get("tex_content") || "").trim();
      if (new TextEncoder().encode(texContent).length > MAX_TEX_BYTES) throw loi("Nội dung TeX lớn hơn 200 KB.", 400);

      const keepRequested = new Set(docDanhSachId(form.get("keep_file_ids")));
      const allowedOldIds = new Set(oldFiles.map((item) => String(item?.id || "")).filter(Boolean));
      const keptFiles = oldFiles.filter((item) => {
        const id = String(item?.id || "");
        return id && allowedOldIds.has(id) && keepRequested.has(id);
      });
      if (keptFiles.length + files.length > MAX_FILES) throw loi(`Mỗi đáp án chỉ được tối đa ${MAX_FILES} tệp.`, 400);

      let newFiles: any[] = [];
      if (files.length) {
        const classInfo = lesson.classes as any;
        const className = classInfo
          ? `Khối ${classInfo.grade} - ${classInfo.name} (${classInfo.is_specialized ? "Chuyên" : "Đại trà"})`
          : "Chưa phân lớp";
        let answerRoot = await timHoacTaoThuMuc(token, "VINHMATH DAP AN LOP");
        for (const folderName of [className, lesson.title || "Bài giảng", "DAP AN CHUNG"]) {
          answerRoot = await timHoacTaoThuMuc(token, folderName, answerRoot);
        }
        newFiles = await taiNhieuFile(token, files, answerRoot, `[${lesson.title || "Bài giảng"}] DAP-AN-`, false);
        newFiles = newFiles.map((item, index) => ({ ...item, mime_type: mimeDapAnAnToan(files[index]) }));
      }

      const finalFiles = [...keptFiles, ...newFiles];
      if (!texContent && !finalFiles.length) {
        await Promise.all(newFiles.map((item) => xoaFileDrive(token, item.id)));
        throw loi("Đáp án cần có ít nhất một ảnh, PDF hoặc nội dung TeX.", 400);
      }

      const answerPayload = {
        lesson_id: lessonId,
        tex_content: texContent || null,
        files: finalFiles,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      };
      const answerWrite = oldAnswer
        ? await svc.from("class_lesson_answers").update(answerPayload).eq("id", oldAnswer.id).select("id, lesson_id, tex_content, files, updated_at").single()
        : await svc.from("class_lesson_answers").insert({ ...answerPayload, created_by: user.id }).select("id, lesson_id, tex_content, files, updated_at").single();
      if (answerWrite.error) {
        await Promise.all(newFiles.map((item) => xoaFileDrive(token, item.id)));
        throw new Error("Không lưu được đáp án chung: " + answerWrite.error.message);
      }

      const finalIds = new Set(finalFiles.map((item) => String(item?.id || "")).filter(Boolean));
      const removedIds = oldFiles.map((item) => String(item?.id || "")).filter((id) => id && !finalIds.has(id));
      await Promise.all(removedIds.map((id) => xoaFileDrive(token, id)));

      const { data: gradedRows } = await svc.from("submissions")
        .select("student_id")
        .eq("lesson_id", lessonId)
        .eq("status", "graded");
      const studentIds = [...new Set((gradedRows || []).map((row: any) => String(row.student_id || "")).filter(Boolean))];
      if (studentIds.length) {
        const notifications = studentIds.map((studentId) => ({
          user_id: studentId,
          title: "Đáp án chung đã sẵn sàng",
          body: `Thầy/cô đã đăng bài sửa cho “${lesson.title || "bài giảng"}”. Em mở kết quả bài đã chấm để xem.`,
          link: `bai-hoc?id=${lessonId}&action=class-answer`,
          kind: "class_answer_ready",
          class_ref: lesson.class_id,
        }));
        const { error: notifyError } = await svc.from("notifications").insert(notifications);
        if (notifyError) console.warn("Không gửi được một số thông báo đáp án:", notifyError.message);
      }
      return traJson({ ok: true, answer: answerWrite.data, notified_count: studentIds.length });
    }

    if (action === "nop") {
      const lessonId = form.get("lesson_id") ? String(form.get("lesson_id")) : null;
      const examId = form.get("exam_id") ? String(form.get("exam_id")) : null;
      if ((!lessonId && !examId) || (lessonId && examId)) throw new Error("Phải chọn đúng một bài giảng hoặc một đề thi.");

      const isTeacher = ["admin", "teacher", "assistant"].includes(prof.role);
      const reqStudentId = form.get("student_id") ? String(form.get("student_id")) : null;
      if (reqStudentId && !isTeacher) throw new Error("Chỉ giáo viên mới được nộp hộ học sinh.");
      if (isTeacher && !reqStudentId) throw new Error("Thầy/cô chưa chọn học sinh để nộp hộ.");

      let targetStudentId = user.id;
      let targetProf: any = prof;
      if (reqStudentId) {
        targetStudentId = reqStudentId;
        const { data: sProf, error: sErr } = await svc.from("profiles").select("username, full_name, role").eq("id", targetStudentId).single();
        if (sErr || !sProf || sProf.role !== "student") throw new Error("Không tìm thấy hồ sơ học sinh hợp lệ.");
        targetProf = sProf;
      }

      let folderPath: string[] = [];
      let targetTitle = "";
      let kindVal = "test";
      let isLate = false;
      let classId: string | null = null;

      if (examId) {
        const { data: exam, error } = await svc.from("exams").select("title, class_id, classes(name, grade, is_specialized)").eq("id", examId).single();
        if (error || !exam) throw new Error("Không tìm thấy đề thi đã chọn.");
        classId = exam.class_id;
        kindVal = "test";
        targetTitle = exam.title || "Đề thi";
        const cl = exam.classes as any;
        const className = cl ? `Khối ${cl.grade} - ${cl.name} (${cl.is_specialized ? "Chuyên" : "Đại trà"})` : "Luyện đề chung";
        folderPath = [className, "Kiểm tra", `${targetProf.username} - ${targetProf.full_name}`, ngay];
      } else {
        if (!LOAI_HOP_LE.has(phanloai)) throw new Error("Chưa chọn rõ loại bài: BTVN, bài thưởng thêm hay bài kiểm tra.");
        const { data: lesson, error } = await svc.from("lessons").select("title, class_id, homework_text, homework_images, homework_latex_content, homework_document_id, homework2_text, homework2_images, homework2_latex_content, homework2_document_id, homework2_due, homework2_late_policy, test_document_id, test_latex_content, linked_exam_id, homework_due, test_deadline, homework_late_policy, test_late_policy, classes(name, grade, is_specialized)").eq("id", lessonId).single();
        if (error || !lesson) throw new Error("Không tìm thấy bài giảng đã chọn.");
        classId = lesson.class_id;
        kindVal = phanloai;
        targetTitle = lesson.title || "Bài giảng";
        const coBtvn = !!(lesson.homework_text || coMang(lesson.homework_images) || lesson.homework_latex_content || lesson.homework_document_id);
        const coBonus = !!(lesson.homework2_text || coMang(lesson.homework2_images) || lesson.homework2_latex_content || lesson.homework2_document_id);
        const coTest = !!(lesson.test_document_id || lesson.test_latex_content || lesson.linked_exam_id);
        if (kindVal === "homework" && !coBtvn) throw new Error("Bài giảng này chưa có BTVN bắt buộc.");
        if (kindVal === "homework_bonus" && !coBonus) throw new Error("Bài giảng này chưa có bài tập thưởng thêm.");
        if (kindVal === "test" && !coTest) throw new Error("Bài giảng này chưa có bài kiểm tra nhận bài nộp.");

        if (!isTeacher) {
          const { data: daCham } = await svc.from("submissions").select("id").eq("student_id", targetStudentId).eq("lesson_id", lessonId).eq("kind", kindVal).eq("status", "graded").limit(1);
          if (daCham?.length) throw new Error("Bài này đã được chấm nên em không nộp lại được nữa.");
        }
        let deadline: any = kindVal === "test" ? lesson.test_deadline : kindVal === "homework_bonus" ? lesson.homework2_due : lesson.homework_due;
        const policy = (kindVal === "test" ? lesson.test_late_policy : kindVal === "homework_bonus" ? lesson.homework2_late_policy : lesson.homework_late_policy) || "late";
        if (kindVal !== "homework_bonus") {
          const ovKind = kindVal === "test" ? "test" : "btvn";
          const { data: ov } = await svc.from("student_deadline_override").select("new_due").eq("student_id", targetStudentId).eq("lesson_id", lessonId).eq("kind", ovKind).maybeSingle();
          if (ov?.new_due) deadline = ov.new_due;
        }
        if (deadline && Date.now() > new Date(deadline).getTime()) {
          if (policy === "lock" && !isTeacher) throw new Error("Bài đã quá hạn và bị khóa. Em vui lòng liên hệ thầy/cô.");
          isLate = true;
        }
        const cl = lesson.classes as any;
        const className = cl ? `Khối ${cl.grade} - ${cl.name} (${cl.is_specialized ? "Chuyên" : "Đại trà"})` : "Chưa phân lớp";
        folderPath = [className, thuMucLoaiTen(kindVal), `${targetProf.username} - ${targetProf.full_name}`, ngay];
      }

      if (isTeacher && !(await coQuyenQuanLyLop(svc, user.id, prof.role, classId))) throw new Error("Thầy/cô không có quyền quản lý lớp của bài đã chọn.");
      await xacNhanHocSinhTrongLop(svc, targetStudentId, classId);
      const dryRun = String(form.get("dry_run") || "") === "1";
      if (dryRun && !isTeacher) throw new Error("Chỉ giáo viên mới được chạy kiểm tra tải tệp.");

      let currentParentId = goc;
      for (const folderName of folderPath) currentParentId = await timHoacTaoThuMuc(token, folderName, currentParentId);
      const ketQua = await taiNhieuFile(token, files, currentParentId, `[${targetTitle}] `);

      if (dryRun) {
        await Promise.all(ketQua.map((item) => xoaFileDrive(token, item.id)));
        return traJson({ ok: true, dry_run: true, uploaded_count: ketQua.length, kind: kindVal, target_title: targetTitle });
      }

      const { data: row, error } = await svc.from("submissions").insert({
        lesson_id: lessonId,
        exam_id: examId,
        student_id: targetStudentId,
        kind: kindVal,
        is_late: isLate,
        files: ketQua,
      }).select("id, submitted_at, kind, is_late").single();
      if (error) {
        await Promise.all(ketQua.map((item) => xoaFileDrive(token, item.id)));
        throw new Error("Không ghi được bài nộp vào sổ chấm: " + error.message);
      }
      return traJson({ ok: true, submission: row, files: ketQua, destination: { kind: kindVal, title: targetTitle, folder: thuMucLoaiTen(kindVal) } });
    }

    if (action !== "cham" && action !== "xoa_cham") throw new Error("Thao tác không hợp lệ.");
    if (!["admin", "teacher", "assistant"].includes(prof.role)) throw new Error("Chỉ giáo viên mới được sửa file chấm.");
    const subId = String(form.get("submission_id") || "");
    if (!subId) throw new Error("Thiếu mã bài nộp.");
    const { data: sub } = await svc.from("submissions").select("id, graded_files, student_id, lesson_id, exam_id, kind, profiles(username, full_name)").eq("id", subId).single();
    if (!sub) throw new Error("Không tìm thấy bài nộp.");
    const hs = sub.profiles as unknown as { username: string; full_name: string };

    let folderPath: string[] = [];
    let titlePrefix = "";
    let classId: string | null = null;
    if (sub.exam_id) {
      const { data: exam } = await svc.from("exams").select("title, class_id, classes(name, grade, is_specialized)").eq("id", sub.exam_id).single();
      if (!exam) throw new Error("Không tìm thấy đề thi của bài nộp.");
      classId = exam.class_id;
      const cl = exam.classes as any;
      const className = cl ? `Khối ${cl.grade} - ${cl.name} (${cl.is_specialized ? "Chuyên" : "Đại trà"})` : "Luyện đề chung";
      titlePrefix = `[${exam.title || "Đề thi"}] CHAM-`;
      folderPath = [className, "Kiểm tra", `${hs.username} - ${hs.full_name}`, ngay];
    } else if (sub.lesson_id) {
      const { data: lesson } = await svc.from("lessons").select("title, class_id, classes(name, grade, is_specialized)").eq("id", sub.lesson_id).single();
      if (!lesson) throw new Error("Không tìm thấy bài giảng của bài nộp.");
      classId = lesson.class_id;
      const cl = lesson.classes as any;
      const className = cl ? `Khối ${cl.grade} - ${cl.name} (${cl.is_specialized ? "Chuyên" : "Đại trà"})` : "Chưa phân lớp";
      titlePrefix = `[${lesson.title || "Bài giảng"}] CHAM-`;
      folderPath = [className, thuMucLoaiTen(sub.kind), `${hs.username} - ${hs.full_name}`, ngay];
    }
    if (!(await coQuyenQuanLyLop(svc, user.id, prof.role, classId))) throw new Error("Thầy/cô không có quyền chấm bài của lớp này.");

    if (action === "xoa_cham") {
      let requestedIds: string[] = [];
      try {
        const parsed = JSON.parse(String(form.get("file_ids") || "[]"));
        if (Array.isArray(parsed)) requestedIds = parsed.map((id) => String(id || "").trim()).filter(Boolean);
      } catch { throw new Error("Danh sách ảnh cần xóa không hợp lệ."); }
      requestedIds = [...new Set(requestedIds)];
      if (!requestedIds.length) throw new Error("Chưa chọn ảnh chấm cần xóa.");
      if (requestedIds.length > MAX_FILES) throw new Error(`Mỗi lần chỉ xóa tối đa ${MAX_FILES} tệp.`);

      const oldFiles = Array.isArray(sub.graded_files) ? (sub.graded_files as any[]) : [];
      const allowedIds = new Set(oldFiles.map((item) => String(item?.id || "")).filter(Boolean));
      const deleteIds = requestedIds.filter((id) => allowedIds.has(id));
      if (!deleteIds.length) throw new Error("Các ảnh đã chọn không còn trong bài chấm.");
      const deleteSet = new Set(deleteIds);
      const remaining = oldFiles.filter((item) => !deleteSet.has(String(item?.id || "")));
      const { error: updateError } = await svc.from("submissions").update({ graded_files: remaining }).eq("id", subId);
      if (updateError) throw new Error("Không cập nhật được danh sách ảnh chấm: " + updateError.message);
      await Promise.all(deleteIds.map((id) => xoaFileDrive(token, id)));
      return traJson({ ok: true, deleted_count: deleteIds.length, graded_files: remaining });
    }

    let currentParentId = goc;
    for (const folderName of folderPath) currentParentId = await timHoacTaoThuMuc(token, folderName, currentParentId);
    const ketQua = await taiNhieuFile(token, files, currentParentId, titlePrefix);
    const tatCa = [...((sub.graded_files as unknown[]) || []), ...ketQua];
    const { error } = await svc.from("submissions").update({ graded_files: tatCa }).eq("id", subId);
    if (error) {
      await Promise.all(ketQua.map((item) => xoaFileDrive(token, item.id)));
      throw new Error("Không cập nhật được file chấm: " + error.message);
    }
    return traJson({ ok: true, graded_files: tatCa });
  } catch (error) {
    console.error("nop-bai:", error);
    const status = Number((error as any)?.status || 500);
    return traJson({ error: String((error as Error)?.message || error) }, status >= 400 && status <= 599 ? status : 500);
  }
});
