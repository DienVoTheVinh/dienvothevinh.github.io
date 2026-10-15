// Run only AFTER validateLatexSource() has verified the embedded style hashes.
// Preserve the author's source and the trusted style assets byte-for-byte;
// repair the legacy packages only in the transient compiler input.
export function prepareValidatedLatexForCompile(tex: string) {
  return tex.replace(
    /(\\begin\s*\{filecontents\*?\}\s*\{(?:casiovn|casio580x)\.sty\})([\s\S]*?)(\\end\s*\{filecontents\*?\})/giu,
    (_block, before, body, after) => before + body.replace(
      /\\DeclareRobustCommand\{\\(exp2k|mul10expk|log10k)\}/g,
      // Digits are not letters in a TeX control word. A csname creates one
      // command token instead of executing stray "10expk" in the preamble.
      (_declaration: string, name: string) => "\\expandafter\\DeclareRobustCommand\\csname " + name + "\\endcsname",
    ) + after,
  );
}
