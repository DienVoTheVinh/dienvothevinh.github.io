// VinhMath LaTeX relay. TikZ requests are content-addressed and cached in a
// private Storage bucket; ordinary document compilation keeps the old relay
// behaviour and is never retained automatically.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2.112.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Expose-Headers": "x-vinhmath-cache, x-vinhmath-render-key",
};
const CACHE_BUCKET = "latex-render-cache";
const CACHE_VERSION = 4;
const MAX_TEX_BYTES = 2_000_000;
const MAX_PDF_BYTES = 25_000_000;
const TIKZ_TIMEOUT_MS = 45_000;
const DOCUMENT_TIMEOUT_MS = 115_000;
const inflight = new Map<string, Promise<Compiled>>();

type Compiled = { bytes: Uint8Array; contentType: string; okPdf: boolean };

function reply(bytes: BodyInit, contentType: string, status = 200, extra: Record<string,string> = {}) {
  return new Response(bytes, {
    status,
    headers: { ...cors, "Content-Type": contentType, "Cache-Control": "no-store", ...extra },
  });
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((n) => n.toString(16).padStart(2, "0")).join("");
}

function isPdf(bytes: Uint8Array, contentType: string) {
  return contentType.toLowerCase().includes("pdf") && bytes.length >= 5 &&
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d;
}

async function compile(tex: string, engine: string, timeoutMs: number): Promise<Compiled> {
  const form = new FormData();
  form.append("filename[]", "document.tex");
  form.append("filecontents[]", tex);
  form.append("engine", engine);
  form.append("return", "pdf");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("https://texlive.net/cgi-bin/latexcgi", {
      method: "POST", body: form, signal: controller.signal,
    });
    const declaredLength = Number(response.headers.get("content-length")) || 0;
    if (declaredLength > MAX_PDF_BYTES) throw new Error("Tệp kết xuất vượt giới hạn 25 MB");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_PDF_BYTES) throw new Error("Tệp kết xuất vượt giới hạn 25 MB");
    const contentType = response.headers.get("content-type") || "text/plain; charset=utf-8";
    return { bytes, contentType, okPdf: response.ok && isPdf(bytes, contentType) };
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return reply("Method not allowed", "text/plain; charset=utf-8", 405);
  try {
    const payload = await request.json();
    const tex = typeof payload?.tex === "string" ? payload.tex : "";
    const engine = ["pdflatex", "xelatex", "lualatex"].includes(payload?.engine) ? payload.engine : "pdflatex";
    const purpose = payload?.purpose === "tikz" ? "tikz" : "document";
    const sourceBytes = new TextEncoder().encode(tex).byteLength;
    if (!tex) throw new Error("Thiếu nội dung LaTeX");
    if (sourceBytes > MAX_TEX_BYTES) throw new Error("Nội dung LaTeX vượt giới hạn 2 MB");

    // Only isolated TikZ previews are retained. Full exams may contain private
    // material and therefore continue through the non-persistent path.
    const tikzCount = (tex.match(/\\begin\s*\{tikzpicture\}/g) || []).length;
    const standalone = /\\documentclass(?:\[[^\]]*\])?\s*\{standalone\}/.test(tex);
    const cacheable = purpose === "tikz" && standalone && tikzCount > 0 && tikzCount <= 16;
    if (!cacheable) {
      const result = await compile(tex, engine, DOCUMENT_TIMEOUT_MS);
      return reply(result.bytes, result.contentType, 200, { "x-vinhmath-cache": "BYPASS" });
    }

    const key = await sha256(`tikz-v${CACHE_VERSION}\0${engine}\0${tex}`);
    const path = `v${CACHE_VERSION}/${key.slice(0, 2)}/${key}.pdf`;
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const hit = await admin.storage.from(CACHE_BUCKET).download(path);
    if (hit.data && !hit.error) {
      const cachedBytes = new Uint8Array(await hit.data.arrayBuffer());
      // Storage da gioi han bucket o application/pdf; kiem tra magic bytes de
      // khong phu thuoc Blob.type (mot so Storage gateway tra octet-stream).
      if (cachedBytes.length <= MAX_PDF_BYTES && isPdf(cachedBytes, "application/pdf")) {
        return reply(cachedBytes, "application/pdf", 200, {
          "Cache-Control": "private, max-age=31536000, immutable",
          "x-vinhmath-cache": "HIT", "x-vinhmath-render-key": key,
        });
      }
      // Khong de mot tep cache hong bi tra lai mai mai.
      await admin.storage.from(CACHE_BUCKET).remove([path]);
    }

    let job = inflight.get(key);
    let ownsJob = false;
    if (!job) {
      ownsJob = true;
      job = compile(tex, engine, TIKZ_TIMEOUT_MS);
      inflight.set(key, job);
      const createdJob = job;
      // Giu ket qua nong vai giay de lap khoang tre giua luc tra response va
      // luc Storage hoan tat ghi nen. Nhu vay request ke tiep khong compile lai.
      createdJob.then(() => {
        setTimeout(() => { if (inflight.get(key) === createdJob) inflight.delete(key); }, 5_000);
      }, () => {
        if (inflight.get(key) === createdJob) inflight.delete(key);
      });
    }
    const result = await job;
    if (ownsJob && result.okPdf && result.bytes.length <= MAX_PDF_BYTES) {
      const upload = admin.storage.from(CACHE_BUCKET).upload(path, result.bytes, {
        contentType: "application/pdf", cacheControl: "31536000", upsert: false,
      });
      // Cache khong nam tren duong phan hoi quan trong cua lan ket xuat dau.
      EdgeRuntime.waitUntil(upload.then(() => undefined).catch(() => undefined));
    }
    return reply(result.bytes, result.contentType, 200, {
      "Cache-Control": result.okPdf ? "private, max-age=31536000, immutable" : "no-store",
      "x-vinhmath-cache": result.okPdf ? (ownsJob ? "MISS" : "COALESCED") : "ERROR",
      "x-vinhmath-render-key": key,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Lỗi không xác định";
    return reply("Lỗi trạm trung chuyển: " + message, "text/plain; charset=utf-8", 500, { "Cache-Control": "no-store" });
  }
});
