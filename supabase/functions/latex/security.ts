const TRUSTED_STYLE_SHA256 = new Map<string, string>([
  ["ex_test.sty", "0f39466f1e151c03574bebc6260058ef2bb47e55f70e4fc07db0005be498a623"],
  ["titledot.sty", "091b743e99c10a10ffac0adac2bf0d54b4759914d512a383fa74f0f738816cba"],
  ["casiovn.sty", "1dab8d093de9e0ed4c356d7d74d04aa805e5194792bc9433e00f8fe973125280"],
  ["casio580x.sty", "89d48005beb550df465286000b5a4a9f6d0b8bb4dfe9614f654e9576cd98e341"],
]);

export class LatexValidationError extends Error {
  readonly status = 400;
  constructor(message = "Nguồn LaTeX chứa lệnh không được phép") {
    super(message);
    this.name = "LatexValidationError";
  }
}

function stripTexComments(source: string) {
  return source.split(/\r?\n/).map((line) => {
    for (let index = 0; index < line.length; index += 1) {
      if (line[index] !== "%") continue;
      let slashes = 0;
      for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) slashes += 1;
      if (slashes % 2 === 0) return line.slice(0, index);
    }
    return line;
  }).join("\n");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((part) => part.toString(16).padStart(2, "0")).join("");
}

function normalizeTrustedStyle(value: string) {
  return value.replace(/\r\n?/g, "\n").replace(/^\n/, "").replace(/\n$/, "");
}

const FILE_CONTENTS = /\\begin\s*\{filecontents\*?\}\s*\{([^{}]+)\}([\s\S]*?)\\end\s*\{filecontents\*?\}/giu;
const FORBIDDEN_CONTROL = /\\(?:@@input|input|include|includeonly|inputiffileexists|iffileexists|subfile|import|subimport|verbatiminput|lstinputlisting|inputminted|includepdf|pgfimage|epsfig|psfig|inputans|inputansbox|bankex|listfile|randombank|openin|openout|newread|newwrite|read|readline|write(?:18)?|immediate|special|catcode|csname|scantokens|primitive|directlua|latelua|luadirect|pdfprimitive|pdfextension|pdffeedback|pdffiledump|pdffilemoddate|pdfmdfivesum|pdfobj|pdfxform|pdfximage|pdfrefximage|pdfannot|pdfcatalog|pdfnames|saveimageresource|useimageresource|saveboxresource|useboxresource|xetexpicfile|xetexpdffile|includegraphics|bibliography|addbibresource)(?![a-z@])/iu;
const FORBIDDEN_PACKAGE = /\\(?:usepackage|requirepackage)(?:\s*\[[^\]]*\])?\s*\{[^}]*\b(?:shellesc|minted|catchfile|catchfilebetweentags|filehook)\b[^}]*\}/iu;
const FORBIDDEN_ENVIRONMENT = /\\begin\s*\{(?:minted|filecontents\*?|fileex|verbatimout)\}/iu;

function removeAllowedFileReads(source: string, virtualFiles: Set<string>) {
  let text = source.replace(
    /\\(?:input|include)\s*(?:\{([^{}]+)\}|([^\s%{}]+))/giu,
    (whole, braced, bare) => {
      const target = String(braced || bare || "").trim().toLowerCase();
      const resolved = virtualFiles.has(target) || (!/\.[a-z0-9]+$/i.test(target) && virtualFiles.has(`${target}.tex`));
      return resolved ? " " : whole;
    },
  );
  text = text.replace(/\\iffileexists\s*\{logo\/vinhmath_logo\.png\}/giu, " ");
  text = text.replace(/\\includegraphics(?:\s*\[[^\]]*\])?\s*\{logo\/vinhmath_logo\.png\}/giu, " ");
  return text;
}

function validateVisibleSource(source: string, virtualFiles: Set<string>) {
  const visible = removeAllowedFileReads(stripTexComments(source), virtualFiles);
  if (FORBIDDEN_CONTROL.test(visible) || FORBIDDEN_PACKAGE.test(visible) ||
      FORBIDDEN_ENVIRONMENT.test(visible) || visible.includes("^^")) {
    throw new LatexValidationError();
  }
  return visible;
}

export async function validateLatexSource(tex: string, purpose: "tikz" | "document") {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(tex)) {
    throw new LatexValidationError("Nguồn LaTeX chứa ký tự điều khiển không hợp lệ");
  }

  FILE_CONTENTS.lastIndex = 0;
  const blocks = Array.from(tex.matchAll(FILE_CONTENTS));
  if (blocks.length > 64) throw new LatexValidationError("Nguồn LaTeX chứa quá nhiều tệp ảo");
  const virtualFiles = new Set<string>();
  for (const block of blocks) {
    const name = block[1].trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{0,127}\.(?:tex|sty)$/i.test(name) || virtualFiles.has(name)) {
      throw new LatexValidationError();
    }
    if (name.endsWith(".sty") && !TRUSTED_STYLE_SHA256.has(name)) {
      throw new LatexValidationError();
    }
    virtualFiles.add(name);
  }

  let scan = tex;
  if (blocks.length) {
    for (const block of blocks) {
      const name = block[1].trim().toLowerCase();
      if (name.endsWith(".sty")) {
        const style = normalizeTrustedStyle(block[2]);
        if (await sha256Hex(style) !== TRUSTED_STYLE_SHA256.get(name)) throw new LatexValidationError();
      } else {
        validateVisibleSource(block[2], virtualFiles);
      }
    }
    scan = tex.replace(FILE_CONTENTS, "\n");
  }
  if (/\\(?:begin|end)\s*\{filecontents\*?\}/iu.test(scan)) throw new LatexValidationError();

  const visible = validateVisibleSource(scan, virtualFiles);

  const tikzCount = (visible.match(/\\begin\s*\{tikzpicture\}/giu) || []).length;
  const standalone = /\\documentclass(?:\s*\[[^\]]*\])?\s*\{standalone\}/iu.test(visible);
  if (purpose === "tikz" && (!standalone || tikzCount < 1 || tikzCount > 16)) {
    throw new LatexValidationError("Yêu cầu TikZ không đúng cấu trúc an toàn");
  }
  return { tikzCount, standalone };
}
