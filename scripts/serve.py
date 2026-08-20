"""Local VinhMath preview with GitHub Pages-style clean HTML URLs."""

from __future__ import annotations

import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


class CleanUrlHandler(SimpleHTTPRequestHandler):
    def do_GET(self) -> None:  # noqa: N802 - stdlib handler API
        parsed = urlsplit(self.path)
        clean_path = parsed.path
        if clean_path != "/" and not Path(clean_path).suffix:
            candidate = Path.cwd() / clean_path.lstrip("/")
            html_candidate = candidate.with_suffix(".html")
            if html_candidate.is_file():
                self.path = clean_path + ".html"
                if parsed.query:
                    self.path += "?" + parsed.query
        super().do_GET()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    server = ThreadingHTTPServer((args.host, args.port), CleanUrlHandler)
    print(f"VinhMath preview: http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
