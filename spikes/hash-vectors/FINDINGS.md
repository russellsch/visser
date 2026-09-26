# Spike 3: cross-language hash vectors

**Result:** independent TypeScript and Python implementations of §7.4 (hashing) and §11.2 (URI) agree byte for byte on 93 of 95 vectors. The 2 divergences come from a spec gap (integral floats), which revision 1.4 closes. The Appendix A excerpt digest `46211103…f358` is reproduced.

**Environment:** Linux, Node v25.9.0 (runs `.ts` directly; the spec targets Node 24), Python 3.14.4. No npm packages.

**Reproduce:**

```sh
python3 gen_vectors.py && node ts/run.ts > expected.json && python3 py/run.py > actual-py.json && python3 compare.py
node naive-sort-demo.ts
```

Files: `gen_vectors.py`/`vectors.json` (inputs), `ts/` and `py/` (implementations, no shared code), `expected.json` (TS output), `actual-py.json`, `compare.py`, `naive-sort-demo.ts`.

## Confirmed bug class

JavaScript's default `sort()` compares UTF-16 code units: `["｡","😀"].sort()` gives `😀, ｡`. On one bundle, a naive sort gives revision `95c00529…` and the spec's code-point order gives `2bb9a496…`. Use `Buffer.compare` on UTF-8 bytes. RFC 8785 (JCS) also sorts by UTF-16, so a JCS library is wrong for this spec.

## Ambiguities resolved in revision 1.4

| # | Gap | Resolution |
|---|---|---|
| A1 | String escaping | Escape only `"`, `\`, U+0000–U+001F (short forms, else lowercase `\u00xx`); all else raw UTF-8. |
| A2 | Lone surrogates | Rejected. |
| A3 | `1.0` / `1e3` (the 2 divergences) | Integers must match `-?(0|[1-9][0-9]*)` at the text level. |
| A4 | Negative zero | `-0` serializes as `0`. |
| A5 | "Canonical" | Not RFC 8785; no JCS library. |
| A6 | Path grammar | Segments non-empty, not `.`/`..`; no NUL, backslash, leading/trailing `/`; NFC. |
| A7 | Digest kind | By declared role, not extension. |
| A8 | Missing codes | Duplicate path, case collision, missing `index.md` → `E_PATH_INVALID`. |
| A9 | docId | Lowercase UUIDv4 regex. |
| A10 | Extension digests | Unique, lowercase, sorted. |
| A11 | Render options | Exactly `{audience, includeSource, layoutFallback}`, all keys present. |
| A12 | Noncanonical URI | Only exact canonical bytes parse; otherwise `E_REF_INVALID`. |
