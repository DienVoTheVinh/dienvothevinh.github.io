"""Check external href/src resources referenced by production root HTML pages."""

import concurrent.futures
import html.parser
import pathlib
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]


class ExternalResources(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = set()

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        rel = set(data.get("rel", "").split())
        for key in ("href", "src"):
            value = data.get(key, "")
            if key == "href" and rel.intersection({"preconnect", "dns-prefetch"}):
                continue
            if value.startswith(("https://", "http://")):
                self.urls.add(value)


def check(url):
    request = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "VinhMath-link-check/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return url, response.status
    except urllib.error.HTTPError as exc:
        if exc.code not in (403, 405):
            return url, exc.code
        request = urllib.request.Request(url, headers={"User-Agent": "VinhMath-link-check/1.0", "Range": "bytes=0-0"})
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                return url, response.status
        except urllib.error.HTTPError as retry:
            return url, retry.code
    except Exception:
        return url, 0


def main():
    parser = ExternalResources()
    for page in ROOT.glob("*.html"):
        parser.feed(page.read_text(encoding="utf-8", errors="replace"))
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results = sorted(pool.map(check, parser.urls))
    failures = [(url, status) for url, status in results if status == 0 or status >= 400]
    if failures:
        for url, status in failures:
            print(f"FAIL {status or 'network'} {url}")
        return 1
    print(f"PASS {len(results)} external production resources")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
