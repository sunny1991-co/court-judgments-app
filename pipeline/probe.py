"""Print the real schema + sample rows of the public court datasets (S3, anonymous)."""
import duckdb, json, subprocess

con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='ap-south-1';")

def show(title, sql):
    print("=" * 20, title)
    try:
        r = con.execute(sql)
        cols = [d[0] for d in r.description]
        print("COLUMNS:", cols)
        for row in r.fetchall():
            print(json.dumps(dict(zip(cols, [str(x)[:300] for x in row])), ensure_ascii=False))
    except Exception as e:
        print("ERROR", type(e).__name__, str(e)[:500])

for b, p in (("indian-supreme-court-judgments", "metadata/parquet/"), ("indian-high-court-judgments", "metadata/parquet/year=2024/")):
    out = subprocess.run(["aws", "s3", "ls", "--no-sign-request", "--recursive", f"s3://{b}/{p}"],
                         capture_output=True, text=True).stdout.splitlines()
    print("=" * 20, b, p, "files:", len(out))
    print("\n".join(out[:25]))

show("SC schema", "DESCRIBE SELECT * FROM read_parquet('s3://indian-supreme-court-judgments/metadata/parquet/year=2023/metadata.parquet')")
show("SC sample", "SELECT * EXCLUDE (raw_html) FROM read_parquet('s3://indian-supreme-court-judgments/metadata/parquet/year=2023/metadata.parquet') LIMIT 3")
show("SC count", "SELECT count(*) FROM read_parquet('s3://indian-supreme-court-judgments/metadata/parquet/*/*.parquet')")
show("HC schema", "DESCRIBE SELECT * FROM read_parquet('s3://indian-high-court-judgments/metadata/parquet/year=2024/*/*/*.parquet', filename=true)")
show("HC sample", "SELECT * EXCLUDE (raw_html) FROM read_parquet('s3://indian-high-court-judgments/metadata/parquet/year=2024/*/*/*.parquet', filename=true) LIMIT 4")
for key in ("data/pdf/year=2023/english/", "data/pdf/year=2024/court=10_8/"):
    b = "indian-supreme-court-judgments" if "english" in key else "indian-high-court-judgments"
    out = subprocess.run(["aws", "s3", "ls", "--no-sign-request", f"s3://{b}/{key}"], capture_output=True, text=True).stdout.splitlines()
    print("=" * 20, b, key); print("\n".join(out[:5]))
for b in ("indian-supreme-court-judgments", "indian-high-court-judgments"):
    out = subprocess.run(["aws", "s3", "ls", "--no-sign-request", f"s3://{b}/metadata/parquet/"], capture_output=True, text=True).stdout
    print("=" * 20, b, "years:"); print(out[:3000])
