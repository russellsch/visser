#!/usr/bin/env python3
"""Run every vector through the Python implementation and print results as JSON."""
import base64
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import explain_hash as eh  # noqa: E402

VECTORS = pathlib.Path(__file__).resolve().parent.parent / "vectors.json"
SPECIAL = {"nan": float("nan"), "infinity": float("inf"), "undefined": eh.UNDEFINED}


def b(s):
    return base64.b64decode(s)


def run(c):
    op = c["op"]
    if op == "text":
        norm = eh.normalize_text(b(c["bytesB64"]))
        return {"normalizedB64": base64.b64encode(norm.encode("utf-8")).decode("ascii"),
                "bodySha256": eh.body_sha256(b(c["bytesB64"]))}
    if op == "cjson":
        value = SPECIAL[c["special"]] if "special" in c else json.loads(c["json"])
        canonical = eh.canonical_json(value)
        return {"canonical": canonical, "sha256": eh.sha256_hex(canonical.encode("utf-8"))}
    if op == "srcrev":
        files = [(f["path"], f["kind"], b(f["contentB64"])) for f in c["files"]]
        return eh.source_revision(c["docId"], files)
    if op == "buildid":
        i = c["input"]
        return eh.build_id(i["sourceRevision"], i["toolkitSha256"], i["extensionDigests"], i["effectiveRenderOptions"])
    if op == "uri_build":
        i = c["input"]
        return {"uri": eh.build_reference_uri(i["docId"], i["targetId"], i["rev"], i["body"])}
    if op == "uri_parse":
        return {"parts": eh.parse_reference_uri(c["uri"])}
    raise ValueError(op)


results = {}
for case in json.loads(VECTORS.read_text())["cases"]:
    try:
        results[case["id"]] = {"ok": True, **run(case)}
    except eh.HashError as exc:
        results[case["id"]] = {"ok": False, "error": exc.code}
json.dump({"implementation": "py", "python": sys.version.split()[0], "results": results},
          sys.stdout, indent=1, ensure_ascii=True)
sys.stdout.write("\n")
