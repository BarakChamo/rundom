# Compares two downloaded qualify.yml runs: WPT named assertions, framework outcomes and per-test durations, matched throughput and RSS.
# usage: python3 qualification/compare.py OLD_DIR NEW_DIR [--top=N]   (default 15 rows per list)
# Each directory holds one run's artifacts as `gh run download` lays them out (wpt-candidate-*, local-wpt-candidate, vue, svelte, mui, perf-*).
# Assertion and pass/fail sets are exact; durations, wall time, throughput and RSS come from shared CI hosts and are indicative only.
import collections, glob, json, os, sys

PROVIDERS = ["candidate", "reference", "happy", "turbo"]


def wpt(root, pattern):
    """Maps (file, assertion name, occurrence) to status, and file to harness status; 0 is a pass for both."""
    statuses, harness = {}, {}
    for path in glob.glob(os.path.join(root, pattern)):
        with open(path, encoding="utf8") as lines:
            for line in filter(str.strip, lines):
                record = json.loads(line)
                harness[record["path"]] = record["harness"]
                seen = collections.Counter()
                for name, status in record["tests"]:
                    seen[name] += 1
                    statuses[(record["path"], name, seen[name])] = status
    return statuses, harness


def compare_wpt(old, new, top):
    for label, pattern in [
        ("upstream WPT", "wpt-candidate-*/subtests.jsonl"),
        ("jsdom-local WPT", "local-wpt-candidate/local-subtests.jsonl"),
    ]:
        (a, ha), (b, hb) = wpt(old, pattern), wpt(new, pattern)
        if not a or not b:
            print(f"## {label}: missing data (old {len(a)}, new {len(b)} assertions)")
            continue
        lost = [k for k, s in a.items() if s == 0 and b.get(k) != 0]
        gained = [k for k, s in b.items() if s == 0 and a.get(k) != 0]
        harness_lost = sum(1 for p, h in ha.items() if h == 0 and hb.get(p) != 0)
        passing = lambda statuses: sum(s == 0 for s in statuses.values())
        print(f"## {label}: files {len(ha)} -> {len(hb)}; passing assertions {passing(a)} -> {passing(b)}; lost {len(lost)}, gained {len(gained)}; harness OK lost {harness_lost}")
        for path, count in collections.Counter(k[0] for k in lost).most_common(top):
            keys = [k for k in lost if k[0] == path][:2]
            print(f"   LOST {count:4d} {path}  e.g. {[k[1][:70] for k in keys]} new={[b.get(k) for k in keys]}")


def framework(root, project, provider):
    """Returns counts, wall seconds, peak MiB and {(file, test): (status, duration ms)}, or None when absent."""
    result = os.path.join(root, project, f"result-{provider}.json")
    if not os.path.exists(result):
        return None
    with open(result, encoding="utf8") as file:
        data = json.load(file)
    timing = os.path.join(root, project, f"timing-{provider}.txt")
    wall, kib = open(timing).read().split()[-2:] if os.path.exists(timing) else ("?", "0")
    tests = {
        (os.path.basename(suite["name"]), test["fullName"]): (test["status"], test.get("duration") or 0)
        for suite in data["testResults"]
        for test in suite["assertionResults"]
    }
    counts = f"{data['numPassedTests']}/{data['numFailedTests']}/{data['numPendingTests']}"
    return {"counts": counts, "wall": wall, "mib": int(kib) / 1024, "tests": tests}


def passed(run):
    return {k for k, (status, _) in run["tests"].items() if status == "passed"}


def compare_frameworks(old, new, top):
    for project in ["vue", "svelte", "mui"]:
        print(f"## frameworks {project} (passed/failed/pending, wall, peak RSS)")
        for provider in PROVIDERS:
            a, b = framework(old, project, provider), framework(new, project, provider)
            show = lambda r: "missing" if r is None else f"{r['counts']} {r['wall']}s {r['mib']:.1f}MiB"
            delta = "" if None in (a, b) else f" lost {len(passed(a) - passed(b))} gained {len(passed(b) - passed(a))}"
            print(f"   {provider:10s} old {show(a):32s} new {show(b)}{delta}")
            if provider != "candidate" or None in (a, b):
                continue
            for key in sorted(passed(a) - passed(b))[:top]:
                print("      LOST", key)
            # Per-test duration change for tests passing in both runs; one-off host noise dominates small deltas.
            both = passed(a) & passed(b)
            slower = sorted(both, key=lambda k: a["tests"][k][1] - b["tests"][k][1])[:top]
            total = lambda r: sum(r["tests"][k][1] for k in both)
            print(f"      summed duration of {len(both)} common passes {total(a):.0f} -> {total(b):.0f} ms; most slowed:")
            for key in slower:
                before, after = a["tests"][key][1], b["tests"][key][1]
                if after > before:
                    print(f"      {after - before:+8.1f} ms ({before:.1f} -> {after:.1f}) {key[0]} {key[1][:90]}")
        c, r = framework(new, project, "candidate"), framework(new, project, "reference")
        if c and r:
            print(f"   new run: jsdom passes lost by RunDOM {len(passed(r) - passed(c))}; RunDOM-only passes {len(passed(c) - passed(r))}")


def compare_matched(old, new):
    for project in ["antd", "mui"]:
        print(f"## matched/perf {project} (commands per minute / peak MiB)")
        for label, root in (("old", old), ("new", new)):
            rows = collections.defaultdict(list)
            for path in glob.glob(os.path.join(root, f"perf-{project}", "batch3-*.json")):
                with open(path, encoding="utf8") as file:
                    record = json.load(file)
                rows[(record["n"], record["provider"])].append(record)
            cells = [
                f"{provider}@{n} {60 * sum(x['passedCommands'] for x in runs) / sum(x['wall'] for x in runs):.2f}/{max(x['peakMiB'] for x in runs):.0f}"
                for n in (1, 2, 4)
                for provider in ("final", "jsdom", "happy", "turbo")
                if (runs := rows.get((n, provider)))
            ]
            print(f"    {label}", " | ".join(cells) or "missing")


def main(argv):
    args = [a for a in argv if not a.startswith("--top")]
    top = next((int(a.split("=", 1)[1]) for a in argv if a.startswith("--top=")), 15)
    if len(args) != 2 or not all(os.path.isdir(a) for a in args):
        sys.exit("usage: python3 qualification/compare.py OLD_DIR NEW_DIR [--top=N]")
    old, new = args
    compare_wpt(old, new, top)
    compare_frameworks(old, new, top)
    compare_matched(old, new)


if __name__ == "__main__":
    main(sys.argv[1:])
