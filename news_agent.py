import json, os, re, html, hashlib
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from zoneinfo import ZoneInfo
import feedparser, requests

ROOT = Path(__file__).resolve().parent
IST = ZoneInfo("Asia/Kolkata")
HEADERS = {"User-Agent": "IndiaDailyNewsAgent/1.0 (RSS reader; links to original publishers)"}

def clean(value):
    value = html.unescape(str(value or ""))
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", value).strip()

def published_at(entry):
    for key in ("published", "updated"):
        raw = entry.get(key)
        if raw:
            try:
                dt = parsedate_to_datetime(raw)
                if dt.tzinfo is None: dt = dt.replace(tzinfo=timezone.utc)
                return dt.astimezone(timezone.utc)
            except Exception: pass
    for key in ("published_parsed", "updated_parsed"):
        val = entry.get(key)
        if val:
            try: return datetime(*val[:6], tzinfo=timezone.utc)
            except Exception: pass
    return None

def norm(title):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", clean(title).lower())).strip()

def similarity(a, b):
    x, y = set(norm(a).split()), set(norm(b).split())
    return len(x & y) / len(x | y) if x and y else 0

def category_for(text, mapping):
    text = text.lower()
    for name, words in mapping.items():
        if any(w.lower() in text for w in words): return name
    return "India & General"

def fetch(feed, cutoff):
    response = requests.get(feed["url"], headers=HEADERS, timeout=25)
    response.raise_for_status()
    parsed = feedparser.parse(response.content)
    out = []
    for e in parsed.entries:
        title, url = clean(e.get("title")), str(e.get("link", "")).strip()
        if not title or not url.startswith(("http://", "https://")): continue
        dt = published_at(e)
        if dt and dt < cutoff: continue
        out.append({
            "title": title, "url": url, "source": feed["name"],
            "published_at_utc": dt.isoformat() if dt else None,
            "published_at_ist": dt.astimezone(IST).isoformat() if dt else None,
            "timestamp": dt.timestamp() if dt else 0,
            "summary": clean(e.get("summary") or e.get("description") or "")[:450]
        })
    return out

def dedupe(items):
    merged = []
    for item in sorted(items, key=lambda s: s["timestamp"], reverse=True):
        match = next((m for m in merged if norm(m["title"]) == norm(item["title"]) or similarity(m["title"], item["title"]) >= .88), None)
        if match:
            if item["source"] not in match["sources"]: match["sources"].append(item["source"])
            match["source_links"].append({"source": item["source"], "url": item["url"]})
            if len(item["summary"]) > len(match["summary"]): match["summary"] = item["summary"]
        else:
            item = dict(item)
            item["sources"] = [item["source"]]
            item["source_links"] = [{"source": item["source"], "url": item["url"]}]
            merged.append(item)
    return merged

def enrich_ai(stories):
    key = os.getenv("OPENAI_API_KEY")
    if not key or not stories: return stories, None
    try:
        from openai import OpenAI
        client = OpenAI(api_key=key)
        payload = [{"id": i, "title": s["title"], "summary": s["summary"], "sources": s["sources"], "category": s["category"]} for i, s in enumerate(stories)]
        res = client.responses.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
            instructions="Use only the supplied headlines and feed excerpts. Do not invent facts. Return strict JSON array of {id, summary, major}; summary at most 35 words; major true only if the supplied information suggests broad public significance.",
            input=json.dumps(payload, ensure_ascii=False)
        )
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", (res.output_text or "").strip())
        by_id = {int(x["id"]): x for x in json.loads(raw) if "id" in x}
        for i, story in enumerate(stories):
            result = by_id.get(i, {})
            if result.get("summary"): story["summary"] = clean(result["summary"])[:320]
            story["ai_major"] = bool(result.get("major", False))
        return stories, None
    except Exception as exc:
        return stories, f"AI enrichment unavailable; rule-based output used ({type(exc).__name__})."

def esc(s): return str(s or "").replace("|", "\\|").replace("\n", " ").strip()

def render_md(config, stories, sources, errors, now, ai_note):
    counts = {}
    for s in stories: counts[s["category"]] = counts.get(s["category"], 0) + 1
    major = [s for s in stories if s["is_major"]]
    lines = [
        f"# {config.get('report_title', 'India Daily News Brief')}", "",
        f"> Published: {now.astimezone(IST).strftime('%d %B %Y, %I:%M %p IST')}  ",
        f"> Coverage: approximately the last {config.get('hours_lookback', 36)} hours", "",
        "## At a glance", "",
        f"- Stories after deduplication: **{len(stories)}**",
        f"- Major stories highlighted: **{len(major)}**",
        f"- Sources checked successfully: **{len(sources)}**", "",
        "### Stories by category", ""
    ]
    lines += [f"- **{esc(k)}:** {v}" for k, v in sorted(counts.items(), key=lambda x: (-x[1], x[0]))] or ["- No stories collected."]
    lines += ["", "## Major stories", ""]
    selected = major[:12] if major else stories[:8]
    if not major and selected: lines += ["_No story met the configured importance heuristic; leading collected headlines are shown instead._", ""]
    if not selected: lines.append("No stories were collected during this run.")
    for i, s in enumerate(selected, 1):
        lines += [f"### {i}. [{esc(s['title'])}]({s['url']})", "",
                  f"- **Category:** {esc(s['category'])}",
                  f"- **Source(s):** {esc(', '.join(s['sources']))}",
                  f"- **Importance score:** {s['importance_score']}/10 (heuristic)"]
        if s.get("published_at_ist"):
            try: lines.append(f"- **Published:** {datetime.fromisoformat(s['published_at_ist']).astimezone(IST).strftime('%d %b %Y, %I:%M %p IST')}")
            except Exception: pass
        if s.get("summary"): lines.append(f"- **Summary:** {esc(s['summary'][:320])}")
        lines.append("")
    lines += ["## All collected stories", ""]
    for s in stories:
        lines.append(f"- [{esc(s['title'])}]({s['url']}) — **{esc(s['category'])}** · {esc(', '.join(s['sources']))}")
    lines += ["", "## Source health", ""]
    lines += [f"- {esc(s)}: checked" for s in sources]
    lines += [f"- ⚠️ {esc(e)}" for e in errors]
    if ai_note: lines += ["", f"> {esc(ai_note)}"]
    lines += ["", "---", "_Read original reporting via source links. Headlines and short RSS excerpts are used for discovery; importance scores are heuristic, not an objective measure of truth or significance._", ""]
    return "\n".join(lines)

def main():
    config = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=int(config.get("hours_lookback", 36)))
    all_stories, good_sources, errors = [], [], []
    for feed in config.get("feeds", []):
        try:
            batch = fetch(feed, cutoff)
            good_sources.append(feed["name"])
            all_stories.extend(batch)
            print(f"{feed['name']}: {len(batch)} stories")
        except Exception as exc:
            errors.append(f"{feed.get('name', 'Unknown source')}: {type(exc).__name__}: {str(exc)[:120]}")
            print(f"Feed failed: {feed.get('name')}: {exc}")

    stories = dedupe(all_stories)
    categories = config.get("categories", {})
    keywords = config.get("major_story_keywords", [])
    urgent = ["breaking", "supreme court", "prime minister", "earthquake", "cyclone", "flood", "election"]
    for s in stories:
        text = (s["title"] + " " + s["summary"]).lower()
        s["category"] = category_for(text, categories)
        score = 1 + min(len(s["sources"]) - 1, 3)
        score += min(sum(1 for k in keywords if k.lower() in text), 3)
        if any(k in text for k in urgent): score += 2
        s["importance_score"] = min(score, 10)
        s["is_major"] = score >= 4
        s["ai_major"] = False
    stories.sort(key=lambda s: (s["importance_score"], s["timestamp"]), reverse=True)

    cap, per_source, source_counts, selected = int(config.get("max_stories", 35)), int(config.get("max_per_source", 12)), {}, []
    for s in stories:
        if len(selected) >= cap: break
        source = s["source"]
        if source_counts.get(source, 0) >= per_source: continue
        source_counts[source] = source_counts.get(source, 0) + 1
        selected.append(s)

    selected, ai_note = enrich_ai(selected)
    for s in selected:
        if s.get("ai_major"): s["is_major"] = True

    md = render_md(config, selected, good_sources, errors, now, ai_note)
    local_date = now.astimezone(IST).date().isoformat()
    (ROOT / "reports").mkdir(exist_ok=True)
    (ROOT / "reports" / "daily").mkdir(parents=True, exist_ok=True)
    (ROOT / "reports" / "DAILY_NEWS.md").write_text(md, encoding="utf-8")
    (ROOT / "reports" / "daily" / f"{local_date}.md").write_text(md, encoding="utf-8")

    category_counts = {}
    for s in selected: category_counts[s["category"]] = category_counts.get(s["category"], 0) + 1
    data = {
        "generated_at_utc": now.isoformat(),
        "generated_at_ist": now.astimezone(IST).isoformat(),
        "title": config.get("report_title", "India Daily News Brief"),
        "summary": f"{len(selected)} stories collected from {len(good_sources)} sources; {sum(1 for s in selected if s['is_major'])} highlighted as major.",
        "sources_checked": good_sources, "source_errors": errors,
        "total_stories": len(selected), "categories": category_counts,
        "stories": [{
            "id": hashlib.sha256((s["url"] + s["title"]).encode()).hexdigest()[:16],
            "title": s["title"], "url": s["url"], "source": s["source"],
            "sources": s["sources"], "source_links": s["source_links"],
            "published_at_utc": s["published_at_utc"], "published_at_ist": s["published_at_ist"],
            "summary": s["summary"], "category": s["category"],
            "importance_score": s["importance_score"], "is_major": s["is_major"]
        } for s in selected]
    }
    (ROOT / "data" / "news.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Generated Markdown report, dated archive and JSON with {len(selected)} stories.")

if __name__ == "__main__":
    main()
