"""Build the app's search data from the public court datasets (S3, anonymous).

Output (folder out/), uploaded as assets of the GitHub release `data-latest`:
  manifest.json            courts, shards, counts, update time
  sc.json.gz               all Supreme Court judgments (small)
  hc_<court>_<label>.json.gz   one High Court, one year (or a decade for
                               old years, to stay under GitHub's asset limit)
Each data file: {"cols": [...], "rows": [[...], ...]} (compact).
PDF links are rebuilt in the app from the row (court/year/bench/file).
"""
from __future__ import annotations

import gzip
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

import duckdb

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "out")
SC = "s3://indian-supreme-court-judgments/metadata/parquet/*/*.parquet"
HC = "s3://indian-high-court-judgments/metadata/parquet/*/*/*/*.parquet"
DESC_SC, DESC_HC = 300, 200
PART_ROWS = 60_000  # keep each file small enough for a phone to open
DECADE_BEFORE = 2000  # older years are grouped by decade

con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='ap-south-1'; SET threads=4;")


def clean(s, n=None):
    if s is None:
        return ""
    s = re.sub(r"[=\-_*]{4,}", " ", str(s))
    s = re.sub(r"\s+", " ", s).strip()
    return s[:n] if n else s


def write(name: str, cols: list, rows: list) -> int:
    path = OUT / name
    with gzip.open(path, "wt", encoding="utf-8", compresslevel=9) as fh:
        json.dump({"cols": cols, "rows": rows}, fh, ensure_ascii=False, separators=(",", ":"))
    return path.stat().st_size


def sc() -> dict:
    q = f"""SELECT title, petitioner, respondent, judge, citation, case_id, cnr, decision_date,
                   disposal_nature, description, path, year
            FROM read_parquet('{SC}', hive_partitioning=true, union_by_name=true)"""
    rows = []
    for t, pet, res, j, cit, cid, cnr, d, disp, desc, path, year in con.execute(q).fetchall():
        try:
            iso = datetime.strptime(str(d), "%d-%m-%Y").date().isoformat()
        except ValueError:
            iso = f"{year}-01-01" if year else ""
        rows.append([clean(t), clean(pet), clean(res), clean(j), clean(cit), clean(cid), clean(cnr),
                     iso, clean(disp), clean(desc, DESC_SC), clean(path), int(year) if year else None])
    rows.sort(key=lambda r: r[7], reverse=True)
    cols = ["title", "petitioner", "respondent", "judge", "citation", "case_id", "cnr", "date",
            "disposal", "desc", "path", "year"]
    size = write("sc.json.gz", cols, rows)
    years = sorted({r[11] for r in rows if r[11]})
    return {"file": "sc.json.gz", "count": len(rows), "bytes": size,
            "years": [years[0], years[-1]] if years else []}


def hc_courts() -> list[str]:
    """Court folders (court=XX_YY) from the bucket listing."""
    import subprocess
    out = subprocess.run(["aws", "s3", "ls", "--no-sign-request", "--recursive",
                          "s3://indian-high-court-judgments/metadata/parquet/"],
                         capture_output=True, text=True, check=True).stdout
    return sorted(set(re.findall(r"court=([0-9]+_[0-9]+)/", out)))


def hc_court(code: str) -> tuple[str, dict]:
    """All rows of one High Court, grouped by year (or decade for old years).
    Court/bench/year come from the file path (not the hive columns)."""
    glob = f"s3://indian-high-court-judgments/metadata/parquet/*/court={code}/*/*.parquet"
    q = f"""SELECT filename, title, judge, cnr, decision_date, disposal_nature, description, pdf_link, court
            FROM read_parquet('{glob}', hive_partitioning=false, union_by_name=true, filename=true)"""
    groups, names = {}, {}
    cur = con.execute(q)
    while True:
        chunk = cur.fetchmany(100_000)
        if not chunk:
            break
        for fn, t, j, cnr, d, disp, desc, link, cname in chunk:
            m = re.search(r"year=(\d{4})/court=[^/]+/bench=([^/]+)/", fn or "")
            if not m:
                continue
            year, bench = int(m.group(1)), m.group(2)
            if cname:
                names[cname] = names.get(cname, 0) + 1
            label = str(year) if year >= DECADE_BEFORE else f"{year // 10 * 10}s"
            iso = d.date().isoformat() if hasattr(d, "date") else str(d or "")[:10]
            file = os.path.basename(str(link)) if link else ""
            groups.setdefault(label, []).append(
                [clean(t), clean(j), clean(cnr), iso, clean(disp), clean(desc, DESC_HC), bench, file, year])
    name = max(names, key=names.get) if names else code
    return name, groups


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    manifest = {"updated_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "source": "registry.opendata.aws: indian-supreme-court-judgments, indian-high-court-judgments (CC-BY-4.0)",
                "sc": sc(), "hc": []}
    print("SC", manifest["sc"], flush=True)
    total = 0
    for code in hc_courts():
        name, groups = hc_court(code)
        shards = []
        for label in sorted(groups, reverse=True):
            rows = sorted(groups[label], key=lambda r: r[3], reverse=True)
            files, size = [], 0
            for k in range(0, len(rows), PART_ROWS):
                fname = f"hc_{code}_{label}_{k // PART_ROWS + 1}.json.gz"
                size += write(fname, ["title", "judge", "cnr", "date", "disposal", "desc", "bench", "file", "year"],
                              rows[k:k + PART_ROWS])
                files.append(fname)
            shards.append({"label": label, "files": files, "count": len(rows), "bytes": size})
            total += len(rows)
        del groups
        manifest["hc"].append({"code": code, "name": name, "shards": shards})
        print("HC", code, name, sum(x["count"] for x in shards), flush=True)
    manifest["hc"].sort(key=lambda c: c["name"])
    manifest["hc_count"] = total
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    files = len(list(OUT.iterdir()))
    print("FILES", files, "HC rows", total)
    if files > 990:
        raise SystemExit("too many release assets; raise DECADE_BEFORE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
