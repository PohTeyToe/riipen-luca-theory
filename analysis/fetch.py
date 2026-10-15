"""Pull Agent Street's public data into data/raw/<YYYY-MM-DD>/ (UTC date).

Standard library only. Run from the repo root:  python -I analysis/fetch.py
Add --only luca or --only gamma to pull one group into the same dated folder.

Rules this follows: one GET per endpoint, a pause between requests, a
User-Agent that names the project, never any /api/admin path.
"""
import argparse
import datetime as dt
import hashlib
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
UA = "riipen-luca-theory-rescore/1.0 (student research, read-only; github.com/PohTeyToe)"
STREET = "https://street.lucatheory.com"
SITE = "https://lucatheory.com"
GAMMA = "https://gamma-api.polymarket.com"
PAUSE = 1.0

API = {
    "predictions.json": "/api/predictions",
    "events.json": "/api/events",
    "king_bets.json": "/api/king/bets",
    "trust_scores.json": "/api/trust-scores",
    "calibration.json": "/api/analytics/calibration",
    "batches.json": "/api/batches/all",
    "season.json": "/api/seasons/current",
}
# Both sites are single-page apps: the methodology text, agent names and the
# essays ship inside one JS bundle per site, linked from the index page.
BUNDLES = {"street_bundle.js": STREET + "/", "site_bundle.js": SITE + "/"}


class Puller:
    def __init__(self, out):
        self.out = out
        self.manifest = []

    def get(self, url):
        assert "/api/admin" not in url
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read()
        time.sleep(PAUSE)
        return body

    def save(self, name, url, body):
        (self.out / name).write_bytes(body)
        self.manifest.append({
            "file": name,
            "url": url,
            "retrievedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "bytes": len(body),
            "sha256": hashlib.sha256(body).hexdigest(),
        })

    def pull(self, name, url):
        body = self.get(url)
        self.save(name, url, body)
        return body


def pull_bundle(p, name, page_url):
    html = p.pull(name.replace("_bundle.js", "_index.html"), page_url).decode("utf-8")
    src = re.search(r'src="(/assets/index-[A-Za-z0-9_-]+\.js)"', html)
    if not src:
        raise SystemExit(f"no bundle script found on {page_url}")
    p.pull(name, urllib.parse.urljoin(page_url, src.group(1)))


def pull_gamma(p, day):
    """Every open market that passes Agent Street's published filters.

    Filters run server side: closed=false, volume_num_min=5000, end date from
    pull date + 3 days to + 90 days. Paged with /markets/keyset (plain offset
    paging stops at 2,100 rows) until there is no next cursor. Parent event
    tags come from /events?id=..., 50 ids per request. That list leaves out
    archived events, so any id it skips is fetched alone from /events/<id>.
    """
    params = {
        "closed": "false",
        "volume_num_min": "5000",
        "end_date_min": (day + dt.timedelta(days=3)).isoformat(),
        "end_date_max": (day + dt.timedelta(days=90)).isoformat(),
        "limit": "100",
    }
    markets, cursor, pages, urls = [], None, 0, []
    while True:
        q = dict(params, **({"after_cursor": cursor} if cursor else {}))
        url = f"{GAMMA}/markets/keyset?{urllib.parse.urlencode(q)}"
        page = json.loads(p.get(url))
        pages += 1
        urls.append(url)
        markets += page.get("markets") or []
        cursor = page.get("next_cursor")
        if not cursor:
            break
        if pages > 500:
            raise SystemExit("gamma keyset paging did not end after 500 pages")

    event_ids = sorted({m["events"][0]["id"] for m in markets if m.get("events")}, key=int)
    events = []
    for i in range(0, len(event_ids), 50):
        chunk = event_ids[i:i + 50]
        url = f"{GAMMA}/events?{'&'.join('id=' + e for e in chunk)}&limit=50"
        events += json.loads(p.get(url))
        urls.append(url)
    for e in sorted(set(event_ids) - {e["id"] for e in events}, key=int):
        url = f"{GAMMA}/events/{e}"
        events.append(json.loads(p.get(url)))
        urls.append(url)

    body = json.dumps({
        "params": params,
        "marketPages": pages,
        "complete": cursor in (None, ""),
        "markets": [{k: m.get(k) for k in ("id", "question", "slug", "endDate", "volumeNum", "closed", "active")}
                    | {"eventId": (m.get("events") or [{}])[0].get("id")} for m in markets],
        "events": [{"id": e["id"], "title": e.get("title"), "slug": e.get("slug"), "archived": e.get("archived"),
                    "tags": [t.get("slug") for t in e.get("tags") or []]} for e in events],
    }, indent=1).encode("utf-8")
    p.save("gamma_supply.json", f"{GAMMA}/markets/keyset ({pages} pages) + /events ({len(urls) - pages} requests)", body)
    p.manifest[-1]["requests"] = len(urls)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["luca", "gamma"])
    args = ap.parse_args()
    day = dt.datetime.now(dt.timezone.utc).date()
    out = ROOT / "data" / "raw" / day.isoformat()
    out.mkdir(parents=True, exist_ok=True)
    p = Puller(out)
    if args.only != "gamma":
        for name, path in API.items():
            p.pull(name, STREET + path)
        for name, page_url in BUNDLES.items():
            pull_bundle(p, name, page_url)
    if args.only != "luca":
        pull_gamma(p, day)
    manifest_path = out / "manifest.json"
    files = {f["file"]: f for f in (json.loads(manifest_path.read_text(encoding="utf-8"))["files"]
                                    if args.only and manifest_path.exists() else [])}
    files.update({f["file"]: f for f in p.manifest})
    manifest_path.write_text(json.dumps({"pullDate": day.isoformat(), "userAgent": UA,
                                         "files": list(files.values())}, indent=1), encoding="utf-8")
    for f in p.manifest:
        print(f"{f['file']:22} {f['bytes']:>9} bytes  {f['url']}")
    print(f"saved to {out}")


if __name__ == "__main__":
    main()
