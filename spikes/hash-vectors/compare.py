#!/usr/bin/env python3
"""Compare expected.json (TypeScript run) with actual-py.json and check the
property assertions recorded in vectors.json (equalTo / notEqualTo, known digest)."""
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
vectors = {c["id"]: c for c in json.loads((HERE / "vectors.json").read_text())["cases"]}
ts = json.loads((HERE / "expected.json").read_text())["results"]
py = json.loads((HERE / "actual-py.json").read_text())["results"]

APPENDIX_A = "46211103f813d56e7736c562cba07868cd8bcd12183327be0da376542fb4f358"
failures, divergent_known = [], []


def digest(r):
    return r.get("sourceRevision") or r.get("buildId") or r.get("bodySha256") or r.get("sha256")


for cid, case in vectors.items():
    a, b = ts[cid], py[cid]
    if a != b:
        (divergent_known if case.get("knownDivergent") else failures).append((cid, a, b))
    elif case.get("knownDivergent"):
        failures.append((cid, "expected divergence did not occur", a))
    for key, want_equal in (("equalTo", True), ("notEqualTo", False)):
        if key in case:
            other = ts[case[key]]
            same = a.get("ok") and other.get("ok") and digest(a) == digest(other)
            if bool(same) != want_equal:
                failures.append((cid, f"{key} {case[key]} property failed", (digest(a), digest(other))))

if ts["t_appendix_a"].get("bodySha256") != APPENDIX_A:
    failures.append(("t_appendix_a", "Appendix A digest mismatch", ts["t_appendix_a"]))

total = len(vectors)
print(f"cases: {total}; agree: {total - len(failures) - len(divergent_known)}; "
      f"known divergences: {len(divergent_known)}; failures: {len(failures)}")
for cid, a, b in divergent_known:
    print(f"  KNOWN DIVERGENCE {cid}: ts={a} py={b}")
for cid, a, b in failures:
    print(f"  FAIL {cid}: {a} | {b}")
sys.exit(1 if failures else 0)
