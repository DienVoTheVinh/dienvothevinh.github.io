"""Static development server with GitHub Pages-style clean URL resolution."""

import argparse
import http.server
import pathlib
import urllib.parse


ROOT = pathlib.Path(__file__).resolve().parents[1]


class CleanUrlHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def translate_path(self, path):
        parsed = urllib.parse.urlsplit(path)
        translated = pathlib.Path(super().translate_path(path))
        if parsed.path != "/" and not pathlib.PurePosixPath(parsed.path).suffix and not translated.exists():
            clean_target = ROOT / parsed.path.lstrip("/")
            if clean_target.with_suffix(".html").is_file():
                path = urllib.parse.urlunsplit(
                    (parsed.scheme, parsed.netloc, parsed.path + ".html", parsed.query, parsed.fragment)
                )
        return super().translate_path(path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8000, type=int)
    args = parser.parse_args()
    server = http.server.ThreadingHTTPServer((args.host, args.port), CleanUrlHandler)
    print(f"VinhMath local preview: http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
