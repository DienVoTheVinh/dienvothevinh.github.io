const files = Array.from(Deno.readDirSync('.'))
  .filter((entry) => entry.isFile && entry.name.endsWith('.html'))
  .map((entry) => entry.name);
let failed = false;
for (const file of files) {
  const source = Deno.readTextFileSync(file);
  const inline = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let index = 0;
  while ((match = inline.exec(source))) {
    index += 1;
    try {
      new Function(match[1]);
    } catch (error) {
      failed = true;
      console.error(`${file}: inline script ${index}: ${error.message}`);
    }
  }
}
if (failed) Deno.exit(1);
console.log(`Inline HTML JavaScript OK (${files.length} files)`);
