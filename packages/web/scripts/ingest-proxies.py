#!/usr/bin/env python3
"""
Builds the ballot seed (src/api/data/ballots.json) from SEC EDGAR proxy statements.

  python3 scripts/ingest-proxies.py            # incremental: only new filings are extracted
  OPENAI_API_KEY=... python3 scripts/ingest-proxies.py --since 2026-01-01

Steps
  1. Map every token in src/api/data/stocks.json to its SEC CIK (from the registry).
  2. Read each issuer's EDGAR submissions feed and keep DEF 14A / DEFM14A filings since --since.
  3. Fetch each proxy statement, strip it to text, and extract the meeting details and every
     voting item with OpenAI structured outputs (gpt-4.1-mini, temperature 0).
  4. Normalise into ballots.json: one ballot per meeting, items in proxy order, instructions
     closing three days before the meeting (00:00 UTC).

The raw extraction is cached in .ingest/ next to this script so re-runs are cheap. Every ballot
links to the filing it came from; where the two differ, the filing governs.
"""
import argparse, datetime, gzip, html, json, os, re, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "src", "api", "data")
CACHE = os.path.join(HERE, ".ingest")
UA = {"User-Agent": "Redeem research (contact: yujiebnb@gmail.com)", "Accept-Encoding": "gzip, deflate"}
KEY = os.environ.get("OPENAI_API_KEY", "")


def get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            data = gzip.decompress(data)
        return data


def to_text(raw):
    s = raw.decode("utf-8", "ignore")
    s = re.sub(r"(?is)<(script|style|head)[^>]*>.*?</\1>", " ", s)
    s = re.sub(r"(?i)</(p|div|tr|li|h[1-6]|br|table)>", "\n", s)
    s = re.sub(r"(?i)</t[dh]>", " | ", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = html.unescape(s).replace("\xa0", " ")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n", s)
    return s.strip()


SCHEMA = {
 "type":"object","additionalProperties":False,
 "properties":{
  "companyName":{"type":"string"},
  "meetingDate":{"type":["string","null"],"description":"YYYY-MM-DD"},
  "meetingTime":{"type":["string","null"]},
  "recordDate":{"type":["string","null"],"description":"YYYY-MM-DD"},
  "meetingType":{"type":"string","enum":["annual","special"]},
  "meetingFormat":{"type":["string","null"],"enum":["virtual","in_person","hybrid",None]},
  "meetingUrl":{"type":["string","null"]},
  "items":{"type":"array","items":{"type":"object","additionalProperties":False,"properties":{
     "index":{"type":"string","description":"Proposal number as printed, e.g. '1', '2', '4a'"},
     "title":{"type":"string","description":"Concise title of the proposal, under 140 characters, written as a noun phrase, e.g. 'Election of nine director nominees for one-year terms'"},
     "summary":{"type":"string","description":"Two to four plain-English sentences describing what stockholders are asked to approve, drawn from the proxy statement."},
     "type":{"type":"string","enum":["election","ratify_auditor","say_on_pay","say_on_frequency","equity_plan","charter_amendment","bylaw_amendment","share_authorization","reverse_split","merger","shareholder_proposal","adjournment","other"]},
     "proponent":{"type":"string","enum":["board","shareholder"]},
     "boardRecommendation":{"type":"string","enum":["for","against","one_year","two_years","three_years","none"]},
     "approvalStandard":{"type":["string","null"],"description":"The vote required, as stated, e.g. 'Majority of votes cast' or 'Plurality of votes cast' or 'Majority of shares outstanding'"},
     "abstainEffect":{"type":["string","null"],"enum":["against","no_effect",None]},
     "brokerNonVoteEffect":{"type":["string","null"],"enum":["against","no_effect","not_applicable",None]},
     "routine":{"type":["boolean","null"],"description":"True if the proxy says brokers may vote uninstructed shares on this item (a routine matter under NYSE Rule 452)"},
     "nominees":{"type":"array","items":{"type":"string"},"description":"Director nominee names for an election item, else empty"}
  },"required":["index","title","summary","type","proponent","boardRecommendation","approvalStandard","abstainEffect","brokerNonVoteEffect","routine","nominees"]}}
 },"required":["companyName","meetingDate","meetingTime","recordDate","meetingType","meetingFormat","meetingUrl","items"]}
SYS = ("You extract voting items from SEC proxy statements (DEF 14A). Read the notice of meeting and the proposals. "
       "Return every matter stockholders are asked to vote on, in order, with the board's recommendation and the vote required. "
       "Never invent proposals. If the vote-required section is not present in the excerpt, set approvalStandard, abstainEffect, brokerNonVoteEffect and routine to null. "
       "Elections are one item unless the proxy itself numbers each nominee separately. Dates must be ISO YYYY-MM-DD.")
def llm(text):
    if not KEY:
        sys.exit("OPENAI_API_KEY is required to extract new filings")
    body = {"model": "gpt-4.1-mini", "temperature": 0,
            "messages": [{"role": "system", "content": SYS}, {"role": "user", "content": text}],
            "response_format": {"type": "json_schema", "json_schema": {"name": "proxy", "strict": True, "schema": SCHEMA}}}
    req = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=json.dumps(body).encode(),
                                 headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                d = json.load(r)
            return json.loads(d["choices"][0]["message"]["content"])
        except urllib.error.HTTPError as e:
            print("HTTP", e.code, e.read().decode()[:300], file=sys.stderr, flush=True)
            time.sleep(5 * (attempt + 1))
        except Exception as e:
            print("ERR", e, file=sys.stderr, flush=True)
            time.sleep(5)
    return None


def scan(stocks, since):
    out = []
    for token in stocks:
        if not token.get("cik"):
            continue
        cik = token["cik"]
        try:
            sub = json.loads(get(f"https://data.sec.gov/submissions/CIK{cik}.json"))
        except Exception as e:
            print("submissions failed", token["symbol"], e, file=sys.stderr)
            continue
        rec = sub["filings"]["recent"]
        for form, date, acc, doc in zip(rec["form"], rec["filingDate"], rec["accessionNumber"], rec["primaryDocument"]):
            if form in ("DEF 14A", "DEFM14A") and date >= since:
                out.append({"symbol": token["symbol"], "cik": cik, "form": form, "filedAt": date, "accession": acc,
                            "docUrl": f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{acc.replace('-', '')}/{doc}"})
        time.sleep(0.15)
    return out


def extract(filings):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, "extracted.json")
    done = json.load(open(path)) if os.path.exists(path) else {}
    for f in filings:
        if f["accession"] in done:
            continue
        try:
            text = to_text(get(f["docUrl"]))
        except Exception as e:
            print("fetch failed", f["symbol"], e, file=sys.stderr)
            continue
        excerpt = text[:70000]
        m = re.search(r"(?i)(vote required|votes? (is|are) required|voting standard|required vote)", text[70000:])
        if m:
            start = 70000 + m.start()
            excerpt += "\n\n[...]\n\n" + text[start:start + 12000]
        result = llm(f"Ticker: {f['symbol']}\nFiling: {f['form']} filed {f['filedAt']}\nURL: {f['docUrl']}\n\n{excerpt}")
        if not result:
            continue
        done[f["accession"]] = {**f, "extracted": result}
        json.dump(done, open(path, "w"), indent=1)
        print(f["symbol"], f["filedAt"], result.get("meetingDate"), len(result["items"]), "items", flush=True)
        time.sleep(0.2)
    return done


def finalize(extracted):
    out, seen = [], set()
    for rec in extracted.values():
        e = rec["extracted"]
        md = e.get("meetingDate")
        if not md or not re.match(r"^\d{4}-\d{2}-\d{2}$", md):
            continue
        if (rec["symbol"], md) in seen:
            continue
        seen.add((rec["symbol"], md))
        items = []
        for i, it in enumerate(e["items"]):
            idx = (it.get("index") or str(i + 1)).strip().rstrip(".").replace("Proposal", "").strip() or str(i + 1)
            items.append({"index": idx, "title": it["title"].strip().rstrip("."), "summary": it["summary"].strip(), "type": it["type"],
                          "proponent": it["proponent"], "boardRecommendation": it["boardRecommendation"],
                          "approvalStandard": it.get("approvalStandard"), "abstainEffect": it.get("abstainEffect"),
                          "brokerNonVoteEffect": it.get("brokerNonVoteEffect"), "routine": it.get("routine"),
                          "nominees": [n.strip() for n in it.get("nominees") or [] if n.strip()]})
        if not items:
            continue
        meeting = datetime.datetime.strptime(md, "%Y-%m-%d").replace(tzinfo=datetime.timezone.utc)
        filed = datetime.datetime.strptime(rec["filedAt"], "%Y-%m-%d").replace(tzinfo=datetime.timezone.utc)
        rd = e.get("recordDate") or ""
        out.append({"id": f"{rec['symbol']}-{md}", "symbol": rec["symbol"], "cik": rec["cik"], "accession": rec["accession"],
                    "form": rec["form"], "filedAt": rec["filedAt"], "docUrl": rec["docUrl"], "companyName": e.get("companyName") or rec["symbol"],
                    "meetingType": e.get("meetingType") or "annual", "meetingDate": md, "meetingTime": e.get("meetingTime"),
                    "meetingFormat": e.get("meetingFormat"), "meetingUrl": e.get("meetingUrl"),
                    "recordDate": rd if re.match(r"^\d{4}-\d{2}-\d{2}$", rd) else None,
                    "closesAt": int((meeting - datetime.timedelta(days=3)).timestamp()), "publishedAt": int(filed.timestamp()), "items": items})
    out.sort(key=lambda b: (b["meetingDate"], b["symbol"]))
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", default="2025-12-01", help="earliest filing date to include (YYYY-MM-DD)")
    args = ap.parse_args()
    stocks = json.load(open(os.path.join(DATA, "stocks.json")))
    filings = scan(stocks, args.since)
    print(len(filings), "proxy filings since", args.since)
    extracted = extract(filings)
    ballots = finalize(extracted)
    json.dump(ballots, open(os.path.join(DATA, "ballots.json"), "w"), indent=1, ensure_ascii=False)
    today = datetime.date.today().isoformat()
    print("wrote", len(ballots), "ballots,", sum(len(b["items"]) for b in ballots), "items;",
          sum(1 for b in ballots if b["meetingDate"] >= today), "with meetings still ahead")
