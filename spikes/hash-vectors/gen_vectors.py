#!/usr/bin/env python3
"""Generate vectors.json: inputs only. Expected outputs come from running the
implementations, not from this file. The Appendix A excerpt is read from
docs/ARCHITECTURE.md (read-only)."""
import base64
import json
import pathlib
import re

HERE = pathlib.Path(__file__).resolve().parent
ARCH = HERE.parent.parent / "docs" / "ARCHITECTURE.md"


def b64(data):
    if isinstance(data, str):
        data = data.encode("utf-8")
    return base64.b64encode(data).decode("ascii")


def appendix_a_excerpt():
    text = ARCH.read_text(encoding="utf-8")
    m = re.search(r"^```python\n(.*?)^```$", text, re.S | re.M)
    return m.group(1)


DOC = "4f8ac70c-7e14-4f06-9865-e194f57c7239"
H = lambda c: c * 64  # a syntactically valid 64-hex digest made of one char
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + b"\r\n\r\nraw-bytes"

cases = []
add = cases.append

# ---- text normalization / bodySha256 --------------------------------------
for cid, data in [
    ("t_ascii", "hello\n"),
    ("t_crlf", "a\r\nb\r\n"),
    ("t_cr", "a\rb\r"),
    ("t_cr_crlf", "a\r\r\nb"),
    ("t_bom", "﻿x\n"),
    ("t_double_bom", "﻿﻿x"),
    ("t_no_final_newline", "no newline"),
    ("t_emoji_nfc", "\U0001F600 café\n"),
    ("t_nfd_not_normalized", "café\n"),
    ("t_empty", ""),
    ("t_appendix_a", appendix_a_excerpt()),
]:
    add({"id": cid, "op": "text", "bytesB64": b64(data)})
for cid, raw in [
    ("t_invalid_ff", b"\xff\xfe"),
    ("t_utf8_surrogate", b"\xed\xa0\x80"),
    ("t_overlong", b"\xc0\xaf"),
    ("t_truncated", b"ok\xe2\x82"),
]:
    add({"id": cid, "op": "text", "bytesB64": b64(raw)})

# ---- canonical JSON --------------------------------------------------------
for cid, js in [
    ("c_scalars", '[null,true,false,0,-1,"s"]'),
    ("c_nested", '{"b":[1,{"z":1,"a":2}],"a":{"y":null,"x":"\\u00e9"}}'),
    ("c_utf16_vs_codepoint", '{"\\uff61":1,"\\ud83d\\ude00":2}'),
    ("c_ascii_order", '{"a":1,"B":2,"_":3,"a0":4,"a-":5}'),
    ("c_escapes", '{"s":"q\\" b\\\\ n\\n t\\t r\\r b\\b f\\f nul\\u0000 us\\u001f del\\u007f ls\\u2028 ps\\u2029 slash/"}'),
    ("c_max_safe", "9007199254740991"),
    ("c_min_safe", "-9007199254740991"),
    ("c_unsafe_int", "9007199254740992"),
    ("c_float", "1.5"),
    ("c_neg_zero", "-0"),
    ("c_lone_surrogate_value", '{"k":"\\ud800"}'),
    ("c_lone_surrogate_key", '{"\\udc00":1}'),
    ("c_empty_object", "{}"),
    ("c_empty_array", "[]"),
]:
    add({"id": cid, "op": "cjson", "json": js})
# Known divergence: JSON text "1.0"/"1e3" parse to integers in JS, floats in Python.
add({"id": "c_float_integral", "op": "cjson", "json": "1.0", "knownDivergent": True})
add({"id": "c_exponent_integral", "op": "cjson", "json": "1e3", "knownDivergent": True})
for cid, special in [("c_nan", "nan"), ("c_infinity", "infinity"), ("c_undefined", "undefined")]:
    add({"id": cid, "op": "cjson", "special": special})

# ---- source revision -------------------------------------------------------
INDEX_LF = "---\nformat: visser/1\n---\n\n<!-- vs:id intro -->\n# Title\n"


def f(path, content, kind="text"):
    return {"path": path, "kind": kind, "contentB64": b64(content)}


add({"id": "s_basic", "op": "srcrev", "docId": DOC, "files": [
    f("index.md", INDEX_LF),
    f("evidence/example.txt", "line one\r\nline two\r\n"),
    f("assets/diagram.png", PNG, "binary"),
]})
add({"id": "s_basic_crlf_index", "op": "srcrev", "docId": DOC, "equalTo": "s_basic", "files": [
    f("index.md", INDEX_LF.replace("\n", "\r\n")),
    f("evidence/example.txt", "line one\nline two\n"),
    f("assets/diagram.png", PNG, "binary"),
]})
add({"id": "s_basic_bom_index", "op": "srcrev", "docId": DOC, "equalTo": "s_basic", "files": [
    f("assets/diagram.png", PNG, "binary"),
    f("index.md", "﻿" + INDEX_LF),
    f("evidence/example.txt", "line one\rline two\r"),
]})
add({"id": "s_binary_not_normalized", "op": "srcrev", "docId": DOC, "notEqualTo": "s_basic", "files": [
    f("index.md", INDEX_LF),
    f("evidence/example.txt", "line one\r\nline two\r\n"),
    f("assets/diagram.png", PNG.replace(b"\r\n", b"\n"), "binary"),
]})
add({"id": "s_sort_order", "op": "srcrev", "docId": DOC, "files": [
    f("index.md", INDEX_LF),
    f("evidence/\U0001F600.txt", "emoji\n"),
    f("evidence/｡.txt", "halfwidth\n"),
    f("a/b.md", "x\n"),
    f("a.md", "y\n"),
    f("B.md", "z\n"),
]})
for cid, path in [
    ("s_nfd_path", "evidence/café.txt"),
    ("s_dotdot", "../secret.txt"),
    ("s_inner_dotdot", "evidence/../../x.txt"),
    ("s_absolute", "/etc/passwd"),
    ("s_dot_prefix", "./notes.txt"),
    ("s_backslash", "evidence\\x.txt"),
    ("s_empty_segment", "evidence//x.txt"),
    ("s_trailing_slash", "evidence/"),
    ("s_nul", "evidence/x\u0000.txt"),
]:
    add({"id": cid, "op": "srcrev", "docId": DOC, "files": [f("index.md", INDEX_LF), f(path, "x\n")]})
add({"id": "s_duplicate_path", "op": "srcrev", "docId": DOC, "files": [f("index.md", INDEX_LF), f("index.md", "other\n")]})
add({"id": "s_missing_index", "op": "srcrev", "docId": DOC, "files": [f("evidence/x.txt", "x\n")]})
add({"id": "s_bad_docid_upper", "op": "srcrev", "docId": DOC.upper(), "files": [f("index.md", INDEX_LF)]})
add({"id": "s_bad_docid_v1", "op": "srcrev", "docId": "4f8ac70c-7e14-1f06-9865-e194f57c7239", "files": [f("index.md", INDEX_LF)]})
add({"id": "s_invalid_utf8_text", "op": "srcrev", "docId": DOC, "files": [f("index.md", b"\xff")]})

# ---- build ID --------------------------------------------------------------
OPTS = {"layoutFallback": False, "audience": "private", "includeSource": False}
add({"id": "b_basic", "op": "buildid", "input": {
    "sourceRevision": H("a"), "toolkitSha256": H("b"),
    "extensionDigests": [H("f"), H("1"), H("c")], "effectiveRenderOptions": OPTS}})
add({"id": "b_sorted_same", "op": "buildid", "equalTo": "b_basic", "input": {
    "sourceRevision": H("a"), "toolkitSha256": H("b"),
    "extensionDigests": [H("1"), H("c"), H("f")], "effectiveRenderOptions": OPTS}})
add({"id": "b_no_extensions", "op": "buildid", "input": {
    "sourceRevision": H("a"), "toolkitSha256": H("b"), "extensionDigests": [], "effectiveRenderOptions": {}}})
add({"id": "b_toolkit_changes_id", "op": "buildid", "notEqualTo": "b_basic", "input": {
    "sourceRevision": H("a"), "toolkitSha256": H("d"),
    "extensionDigests": [H("f"), H("1"), H("c")], "effectiveRenderOptions": OPTS}})
add({"id": "b_upper_hex", "op": "buildid", "input": {
    "sourceRevision": H("A"), "toolkitSha256": H("b"), "extensionDigests": [], "effectiveRenderOptions": {}}})
add({"id": "b_short_hex", "op": "buildid", "input": {
    "sourceRevision": "ab" * 31, "toolkitSha256": H("b"), "extensionDigests": [], "effectiveRenderOptions": {}}})
add({"id": "b_duplicate_extension", "op": "buildid", "input": {
    "sourceRevision": H("a"), "toolkitSha256": H("b"), "extensionDigests": [H("c"), H("c")], "effectiveRenderOptions": {}}})
add({"id": "b_float_option", "op": "buildid", "input": {
    "sourceRevision": H("a"), "toolkitSha256": H("b"), "extensionDigests": [], "effectiveRenderOptions": {"scale": 1.5}}})
add({"id": "b_fixed_decimal_option", "op": "buildid", "input": {
    "sourceRevision": H("a"), "toolkitSha256": H("b"), "extensionDigests": [], "effectiveRenderOptions": {"scale": "1.500"}}})

# ---- reference URI ---------------------------------------------------------
REV, BODY = H("a"), H("b")
add({"id": "u_build", "op": "uri_build", "input": {"docId": DOC, "targetId": "enqueue", "rev": REV, "body": BODY}})
add({"id": "u_build_bad_target", "op": "uri_build", "input": {"docId": DOC, "targetId": "Enqueue", "rev": REV, "body": BODY}})
good = f"visser://{DOC}/enqueue?rev={REV}&body={BODY}"
for cid, uri in [
    ("u_ok", good),
    ("u_ok_hyphen_underscore", f"visser://{DOC}/b_7tmj7g2h-x?rev={REV}&body={BODY}"),
    ("u_body_first", f"visser://{DOC}/enqueue?body={BODY}&rev={REV}"),
    ("u_duplicate_rev", f"visser://{DOC}/enqueue?rev={REV}&rev={REV}&body={BODY}"),
    ("u_unknown_key", f"{good}&x=1"),
    ("u_missing_body", f"visser://{DOC}/enqueue?rev={REV}"),
    ("u_trailing_amp", f"{good}&"),
    ("u_uppercase_hex", f"visser://{DOC}/enqueue?rev={H('A')}&body={BODY}"),
    ("u_short_hex", f"visser://{DOC}/enqueue?rev={'a' * 63}&body={BODY}"),
    ("u_port", f"visser://{DOC}:80/enqueue?rev={REV}&body={BODY}"),
    ("u_credentials", f"visser://user@{DOC}/enqueue?rev={REV}&body={BODY}"),
    ("u_fragment", f"{good}#x"),
    ("u_empty_fragment", f"{good}#"),
    ("u_encoded_slash", f"visser://{DOC}/a%2Fb?rev={REV}&body={BODY}"),
    ("u_encoded_letter", f"visser://{DOC}/%65nqueue?rev={REV}&body={BODY}"),
    ("u_bad_percent", f"visser://{DOC}/a%zz?rev={REV}&body={BODY}"),
    ("u_extra_segment", f"visser://{DOC}/enqueue/more?rev={REV}&body={BODY}"),
    ("u_trailing_slash", f"visser://{DOC}/enqueue/?rev={REV}&body={BODY}"),
    ("u_no_target", f"visser://{DOC}/?rev={REV}&body={BODY}"),
    ("u_upper_uuid", f"visser://{DOC.upper()}/enqueue?rev={REV}&body={BODY}"),
    ("u_uuid_v1", f"visser://4f8ac70c-7e14-1f06-9865-e194f57c7239/enqueue?rev={REV}&body={BODY}"),
    ("u_target_upper", f"visser://{DOC}/Enqueue?rev={REV}&body={BODY}"),
    ("u_target_digit_first", f"visser://{DOC}/1abc?rev={REV}&body={BODY}"),
    ("u_target_65", f"visser://{DOC}/{'a' * 65}?rev={REV}&body={BODY}"),
    ("u_target_64", f"visser://{DOC}/{'a' * 64}?rev={REV}&body={BODY}"),
    ("u_wrong_scheme", f"https://{DOC}/enqueue?rev={REV}&body={BODY}"),
    ("u_scheme_upper", f"VISSER://{DOC}/enqueue?rev={REV}&body={BODY}"),
    ("u_single_slash", f"visser:/{DOC}/enqueue?rev={REV}&body={BODY}"),
    ("u_non_ascii", f"visser://{DOC}/enquéue?rev={REV}&body={BODY}"),
    ("u_whitespace", f" {good}"),
    ("u_plus_in_query", f"visser://{DOC}/enqueue?rev=+{REV[1:]}&body={BODY}"),
]:
    add({"id": cid, "op": "uri_parse", "uri": uri})

out = {"schema": "visser-hash-vectors/spike-1", "cases": cases}
(HERE / "vectors.json").write_text(json.dumps(out, indent=1, ensure_ascii=True) + "\n")
print(f"wrote {len(cases)} cases")
