# Summarizes a raw `benchmark:lab run` report directory: per-scenario phase medians and RunDOM losses against each rival.
# usage: python3 qualification/lab-summary.py /absolute/cohort/timing-XXXX   (writes summary-medians.json beside the trials)
# Screen trials (round -1) are excluded; medians are exploratory unless the run used --conditions isolated-host.
import collections, glob, json, os, statistics as st, sys

D = sys.argv[1]
rows = collections.defaultdict(lambda: collections.defaultdict(list))
for path in glob.glob(D + "/*/result.json"):
    if os.path.basename(os.path.dirname(path)).endswith("--1"):
        continue
    d = json.load(open(path))
    ph = {p["name"]: p for p in d["phases"]}
    batches = [p["wallMs"] for p in d["phases"] if p["name"].startswith("batch-")]
    rows[d["scenario"]][d["provider"]].append(dict(
        load=ph["provider-load"]["wallMs"], first=ph["first-use"]["wallMs"], warm=st.median(batches),
        peak=max(p["memory"]["peakRssBytes"] for p in d["phases"]) / 1048576,
        span=(d["phases"][-1]["endUs"] - d["phases"][0]["startUs"]) / 1000))
K = ["load", "first", "warm", "span", "peak"]
table = {s: {p: {k: st.median(x[k] for x in l) for k in K} | {"n": len(l)} for p, l in pr.items()} for s, pr in rows.items()}
json.dump(table, open(D + "/summary-medians.json", "w"), indent=1)
for rival in ["turbo-dom", "jsdom", "happy-dom"]:
    both = [s for s in table if rival in table[s] and "run-dom" in table[s]]
    if not both:
        continue
    print(f"\n### RunDOM vs {rival}: {len(both)} scenarios both completed; sum of span medians "
          f"RunDOM {sum(table[s]['run-dom']['span'] for s in both) / 1000:.2f}s rival {sum(table[s][rival]['span'] for s in both) / 1000:.2f}s")
    for k in ["first", "warm", "span", "peak"]:
        lose = sorted(((table[s]["run-dom"][k] - table[s][rival][k], s) for s in both if table[s]["run-dom"][k] > table[s][rival][k]), reverse=True)
        print(f" {k}: RunDOM worse in {len(lose)}/{len(both)}")
        for delta, s in lose[:14 if rival == "turbo-dom" else 6]:
            print(f"    {s:26s} {table[s]['run-dom'][k]:9.2f} vs {table[s][rival][k]:9.2f}  (+{delta:.2f}, {table[s]['run-dom'][k] / max(table[s][rival][k], 1e-9):.1f}x)")
rust = [s for s in sorted(table) if "run-dom-rust" in table[s] and "run-dom" in table[s]]
if rust:
    print("\n### TS vs Rust warm/peak")
    for s in rust:
        a, b = table[s]["run-dom"], table[s]["run-dom-rust"]
        print(f"  {s:24s} warm {a['warm']:8.2f}/{b['warm']:8.2f} peak {a['peak']:7.1f}/{b['peak']:7.1f} n={a['n']}")
