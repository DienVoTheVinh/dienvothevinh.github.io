// Trạm trung chuyển LaTeX: nhận code .tex từ web VinhMath,
// gửi tới texlive.net biên dịch, trả về PDF (hoặc log lỗi).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { tex, engine } = await req.json();
    if (!tex) throw new Error("Thiếu nội dung LaTeX");
    const fd = new FormData();
    fd.append("filename[]", "document.tex");
    fd.append("filecontents[]", tex);
    fd.append("engine", engine || "pdflatex");
    fd.append("return", "pdf");
    const r = await fetch("https://texlive.net/cgi-bin/latexcgi", { method: "POST", body: fd });
    const buf = await r.arrayBuffer();
    const ct = r.headers.get("content-type") || "text/plain";
    return new Response(buf, { headers: { ...cors, "Content-Type": ct } });
  } catch (e) {
    return new Response("Loi tram trung chuyen: " + e.message, {
      status: 500,
      headers: { ...cors, "Content-Type": "text/plain" },
    });
  }
});
