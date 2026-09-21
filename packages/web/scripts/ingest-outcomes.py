#!/usr/bin/env python3
"""
Builds src/api/data/outcomes.json: what shareholders actually decided at each meeting on file,
read from the issuer's own Form 8-K, Item 5.07 (Submission of Matters to a Vote of Security Holders).

  OPENAI_API_KEY=... python3 scripts/ingest-outcomes.py

For every ballot in ballots.json whose meeting date has passed, find the first 8-K listing Item
5.07 filed on or after the meeting date (within 12 days), fetch it, and extract the reported counts
per proposal with OpenAI structured outputs (gpt-4.1-mini, temperature 0). Every outcome links to
the 8-K it came from; where the two differ, the filing governs. Nothing is inferred: a meeting with
no 5.07 on EDGAR yet simply has no outcome.
"""
import datetime, gzip, html, json, os, re, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "src", "api", "data")
CACHE = os.path.join(HERE, ".ingest")
UA = {"User-Agent": "Redeem research (contact: yujiebnb@gmail.com)", "Accept-Encoding": "gzip, deflate"}
KEY = os.environ.get("OPENAI_API_KEY", "")

NUM = {"type": ["integer", "null"]}
SCHEMA = {"type": "object", "additionalProperties": False, "properties": {
  "meetingDate": {"type": ["string", "null"], "description": "YYYY-MM-DD"},
  "items": {"type": "array", "items": {"type": "object", "additionalProperties": False, "properties": {
    "index": {"type": "string", "description": "Proposal number as printed, e.g. '1', '2a'"},
    "title": {"type": "string"},
    "votesFor": NUM, "votesAgainst": NUM, "votesAbstain": NUM, "votesWithheld": NUM, "brokerNonVotes": NUM,
    "oneYear": NUM, "twoYears": NUM, "threeYears": NUM,
    "nominees": {"type": "array", "items": {"type": "object", "additionalProperties": False, "properties": {
      "name": {"type": "string"}, "votesFor": NUM, "votesAgainst": NUM, "votesWithheld": NUM, "votesAbstain": NUM, "brokerNonVotes": NUM},
      "required": ["name", "votesFor", "votesAgainst", "votesWithheld", "votesAbstain", "brokerNonVotes"]}},
    "result": {"type": ["string", "null"], "enum": ["approved", "not_approved", "elected", "not_elected", "one_year", "two_years", "three_years", None],
               "description": "Only if the filing states it or the counts make it unambiguous; otherwise null"}},
    "required": ["index", "title", "votesFor", "votesAgainst", "votesAbstain", "votesWithheld", "brokerNonVotes", "oneYear", "twoYears", "threeYears", "nominees", "result"]}}},
  "required": ["meetingDate", "items"]}
SYS = ("You extract shareholder meeting voting results from an SEC Form 8-K, Item 5.07. Return every proposal in order with the "
       "vote counts exactly as reported. Use null for any count the filing does not give. For director elections list each nominee "
       "with their own counts and leave the proposal-level counts null. Never invent or estimate a number.")


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
        return gzip.decompress(data) if r.headers.get("Content-Encoding") == "gzip" else data


def to_text(raw):
    s = raw.decode("utf-8", "ignore")
    s = re.sub(r"(?is)<(script|style|head)[^>]*>.*?</\1>", " ", s)
    s = re.sub(r"(?i)</(p|div|tr|li|h[1-6]|br|table)>", "\n", s)
    s = re.sub(r"(?i)</t[dh]>", " | ", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s).replace("\xa0", " ")
    return re.sub(r"\n\s*\n+", "\n", re.sub(r"[ \t]+", " ", s)).strip()


def llm(text):
    body = {"model": "gpt-4.1-mini", "temperature": 0,
            "messages": [{"role": "system", "content": SYS}, {"role": "user", "content": text}],
            "response_format": {"type": "json_schema", "json_schema": {"name": "outcome", "strict": True, "schema": SCHEMA}}}
    req = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=json.dumps(body).encode(),
                                 headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                return json.loads(json.load(r)["choices"][0]["message"]["content"])
        except urllib.error.HTTPError as e:
            print("HTTP", e.code, file=sys.stderr, flush=True)
            time.sleep(5 * (attempt + 1))
        except Exception as e:
            print("ERR", e, file=sys.stderr, flush=True)
            time.sleep(5)
    return None


def main():
    if not KEY:
        sys.exit("OPENAI_API_KEY is required")
    os.makedirs(CACHE, exist_ok=True)
    cache_path = os.path.join(CACHE, "outcomes.json")
    cache = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
    ballots = json.load(open(os.path.join(DATA, "ballots.json")))
    today = datetime.date.today().isoformat()
    due = [b for b in ballots if b["meetingDate"] < today]
    print(len(due), "meetings held;", len(cache), "cached", flush=True)
    for b in due:
        if b["id"] in cache:
            continue
        try:
            sub = json.loads(get(f"https://data.sec.gov/submissions/CIK{b['cik']}.json"))
        except Exception as e:
            print("submissions failed", b["symbol"], e, file=sys.stderr)
            continue
        rec = sub["filings"]["recent"]
        limit = (datetime.date.fromisoformat(b["meetingDate"]) + datetime.timedelta(days=12)).isoformat()
        hit = None
        rows = list(zip(rec["form"], rec["filingDate"], rec["accessionNumber"], rec["primaryDocument"], rec.get("items", [""] * len(rec["form"]))))
        for form, date, acc, doc, items in reversed(rows):
            if form in ("8-K", "8-K/A") and "5.07" in (items or "") and b["meetingDate"] <= date <= limit:
                hit = {"form": form, "filedAt": date, "accession": acc, "docUrl": f"https://www.sec.gov/Archives/edgar/data/{int(b['cik'])}/{acc.replace('-', '')}/{doc}"}
                break
        time.sleep(0.15)
        if not hit:
            cache[b["id"]] = None
            json.dump(cache, open(cache_path, "w"), indent=1)
            print(b["symbol"], b["meetingDate"], "no 5.07 found", flush=True)
            continue
        try:
            text = to_text(get(hit["docUrl"]))
        except Exception as e:
            print("fetch failed", b["symbol"], e, file=sys.stderr)
            continue
        m = re.search(r"(?i)item\s*5\.07", text)
        start = max(0, (m.start() if m else 0) - 200)
        result = llm(f"Ticker: {b['symbol']}\nMeeting: {b['meetingDate']}\nURL: {hit['docUrl']}\n\n{text[start:start + 30000]}")
        if not result:
            continue
        cache[b["id"]] = {**hit, "symbol": b["symbol"], "ballotId": b["id"], "items": result["items"]}
        json.dump(cache, open(cache_path, "w"), indent=1)
        print(b["symbol"], b["meetingDate"], len(result["items"]), "results", flush=True)
        time.sleep(0.2)
    out = {k: v for k, v in cache.items() if v and v.get("items")}
    json.dump(out, open(os.path.join(DATA, "outcomes.json"), "w"), indent=1)
    print(len(out), "outcomes written", flush=True)


if __name__ == "__main__":
    main()
