# Summarizes qualification/replay.sh results: outcomes, wall time, peak RSS and per-test RunDOM-vs-rival durations.
# usage: python3 qualification/replay-summary.py [QUAL_DIR]   (default <repo>/.cache/qualification-replay)
# Reads timing files in the CI `%e %M` format (wall seconds, peak RSS KiB) and older BSD `time -l` output.
import collections, json, re, statistics, sys
from pathlib import Path

Q = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / ".cache/qualification-replay").resolve()
PROVIDERS = ["candidate", "reference", "happy", "turbo"]


def timing(text):
    """Returns (wall seconds, peak RSS MiB) or None for an incomplete timing file."""
    plain = re.fullmatch(r"\s*([\d.]+)\s+(\d+)\s*", text)
    if plain:
        return float(plain.group(1)), int(plain.group(2)) / 1024
    real, peak = re.search(r"([\d.]+) real", text), re.search(r"(\d+)\s+maximum resident set size", text)
    return (float(real.group(1)), int(peak.group(1)) / 1048576) if real and peak else None


def relative(name, root):
    path = Path(name).resolve()
    return path.relative_to(root).as_posix() if path.is_relative_to(root) else path.as_posix()


summary = {}
for out in sorted(p for p in (Q / "results").glob("*") if p.is_dir()):
    project, root = out.name, (Q / out.name).resolve()
    rows = {}
    for provider in PROVIDERS:
        walls, rss, counts, durations, statuses = [], [], None, collections.defaultdict(list), {}
        for path in sorted(out.glob(f"timing-{provider}-r*.txt")):
            measured = timing(path.read_text())
            result = path.with_name(path.name.replace("timing-", "result-").replace(".txt", ".json"))
            if not (measured and result.exists()):
                continue
            walls.append(measured[0])
            rss.append(measured[1])
            data = json.loads(result.read_text())
            counts = (data["numPassedTests"], data["numFailedTests"], data["numPendingTests"])
            for suite in data["testResults"]:
                name = relative(suite["name"], root)
                for case in suite["assertionResults"]:
                    key = (name, case["fullName"])
                    statuses[key] = case["status"]
                    if case.get("duration") is not None:
                        durations[key].append(case["duration"])
        rows[provider] = dict(walls=walls, rss=rss, counts=counts, statuses=statuses,
                              durations={k: statistics.median(v) for k, v in durations.items()})
    print(f"\n## {project}")
    for provider, row in rows.items():
        if not row["walls"]:
            print(f"{provider:10s} no data")
            continue
        print(f"{provider:10s} pass/fail/skip={row['counts']} wall median={statistics.median(row['walls']):.2f}s "
              f"{sorted(row['walls'])} peakRSS median={statistics.median(row['rss']):.1f}MiB n={len(row['walls'])}")
    passed = {p: {k for k, s in rows[p]["statuses"].items() if s == "passed"} for p in PROVIDERS}
    lost = sorted(passed["reference"] - passed["candidate"])
    print("jsdom passes lost by RunDOM:", len(lost), "| RunDOM-only passes:", len(passed["candidate"] - passed["reference"]))
    for key in lost[:20]:
        print("  LOST", key)
    summary[project] = {}
    for rival in ["reference", "happy", "turbo"]:
        mine, theirs = rows["candidate"]["durations"], rows[rival]["durations"]
        common = [k for k in passed["candidate"] & passed[rival] if k in mine and k in theirs]
        if not common:
            continue
        total_mine, total_theirs = sum(mine[k] for k in common), sum(theirs[k] for k in common)
        slower = [k for k in common if mine[k] > theirs[k]]
        material = sorted((k for k in common if mine[k] - theirs[k] > 2), key=lambda k: theirs[k] - mine[k])
        print(f"vs {rival:9s} common passing tests={len(common)} RunDOM test ms={total_mine:.0f} rival={total_theirs:.0f} "
              f"slower in {len(slower)}; >2ms slower in {len(material)} (excess {sum(mine[k] - theirs[k] for k in material):.0f} ms)")
        for k in material[:8]:
            print(f"   +{mine[k] - theirs[k]:.0f}ms ({mine[k]:.0f} vs {theirs[k]:.0f}) {k[0].split('/')[-1]} :: {k[1][:90]}")
        summary[project][rival] = dict(common=len(common), mine=total_mine, theirs=total_theirs,
                                       slower=len(slower), material=len(material))
(Q / "results" / "summary.json").write_text(json.dumps(summary, indent=1))
