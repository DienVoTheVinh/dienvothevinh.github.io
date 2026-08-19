"""Dependency-free checks for syntax, static links, and privileged-secret indicators."""

import argparse
import html.parser
import pathlib
import py_compile
import re
import subprocess
import sys
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[1]
IGNORED = {".git", ".tools", ".source-package", ".source", "node_modules", "BD-HSG-THCS"}
SECRET_RULES = {
    "service-role JWT": re.compile(r"eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}"),
    "Supabase secret key": re.compile(r"sb_secret_[A-Za-z0-9_-]{12,}"),
    "Postgres URL with password": re.compile(
        r"postgres(?:ql)?://(?!user:pass@|username:password@)[^\s:/]+:[^\s@]+@", re.I
    ),
}
PLACEHOLDER_FILES = {ROOT / ".env.example", ROOT / "web" / "supabase" / ".env.example"}


def files(suffix=None):
    for path in ROOT.rglob("*"):
        if not path.is_file() or any(part in IGNORED for part in path.parts):
            continue
        if suffix is None or path.suffix.lower() in suffix:
            yield path


class Links(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.values = []

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        for key in ("href", "src"):
            if data.get(key):
                self.values.append(data[key])


def static_links():
    errors = []
    # The production site is the repository root. `web/` contains historical copies.
    for page in ROOT.glob("*.html"):
        parser = Links()
        parser.feed(page.read_text(encoding="utf-8", errors="replace"))
        for raw in parser.values:
            parsed = urllib.parse.urlsplit(raw)
            if parsed.scheme or parsed.netloc or raw.startswith(("#", "mailto:", "tel:", "javascript:", "data:")):
                continue
            rel = urllib.parse.unquote(parsed.path)
            if not rel or rel.startswith("//"):
                continue
            target = (ROOT / rel.lstrip("/")) if rel.startswith("/") else (page.parent / rel)
            if target.exists() or (not target.suffix and target.with_suffix(".html").exists()):
                continue
            errors.append(f"{page.relative_to(ROOT)} -> {raw}")
    return errors


def secret_indicators():
    findings = []
    for path in files():
        if path in PLACEHOLDER_FILES or path.suffix.lower() in {".png", ".jpg", ".jpeg", ".ttf", ".enc", ".pdf", ".zip"}:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        for label, rule in SECRET_RULES.items():
            if rule.search(text):
                findings.append(f"{path.relative_to(ROOT)}: {label}")
    return findings


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--node", help="Path to node executable")
    args = parser.parse_args()
    failures = []
    for path in files({".py"}):
        try:
            py_compile.compile(str(path), doraise=True)
        except py_compile.PyCompileError as exc:
            failures.append(f"Python syntax: {path.relative_to(ROOT)}: {exc.msg}")
    if args.node:
        for path in files({".js"}):
            result = subprocess.run([args.node, "--check", str(path)], capture_output=True, text=True)
            if result.returncode:
                failures.append(f"JavaScript syntax: {path.relative_to(ROOT)}")
    else:
        print("SKIP JavaScript syntax: Node path not supplied")
    failures.extend("Broken static link: " + item for item in static_links())
    failures.extend("Privileged secret indicator: " + item for item in secret_indicators())
    if failures:
        print("\n".join(failures))
        return 1
    print("PASS Python syntax, JavaScript syntax, static links, and privileged-secret scan")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
