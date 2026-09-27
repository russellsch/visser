"""Spike implementation of ARCHITECTURE.md §7.4 hashing and the §11.2 reference URI.

Written from the spec text, independently of ../ts/. Python standard library only.
Choices where the spec is silent are listed in ../FINDINGS.md.
"""
import hashlib
import math
import re
import unicodedata
import urllib.parse

HEX64 = re.compile(r"[0-9a-f]{64}")
UUID_V4 = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}")
TARGET_ID = re.compile(r"[a-z][a-z0-9_-]{0,63}")
MAX_SAFE = 2**53 - 1


class HashError(Exception):
    def __init__(self, code, message=""):
        super().__init__(message)
        self.code = code


def sha256_hex(data):
    return hashlib.sha256(data).hexdigest()


def normalize_text(raw):
    """Strict UTF-8 decode, drop one leading BOM, CRLF and lone CR become LF."""
    try:
        text = raw.decode("utf-8", errors="strict")
    except UnicodeDecodeError as exc:
        raise HashError("E_UTF8", str(exc)) from None
    if text[:1] == "\ufeff":
        text = text[1:]
    return text.replace("\r\n", "\n").replace("\r", "\n")


def body_sha256(span_bytes):
    return sha256_hex(normalize_text(span_bytes).encode("utf-8"))


def _check_scalar_values(s):
    # Python str can hold lone surrogates (e.g. from json.loads("\"\\ud800\"")).
    for ch in s:
        if 0xD800 <= ord(ch) <= 0xDFFF:
            raise HashError("E_LONE_SURROGATE", "lone surrogate")


def _json_string(s):
    _check_scalar_values(s)
    parts = ['"']
    for ch in s:
        if ch == '"':
            parts.append('\\"')
        elif ch == "\\":
            parts.append("\\\\")
        elif ch == "\b":
            parts.append("\\b")
        elif ch == "\f":
            parts.append("\\f")
        elif ch == "\n":
            parts.append("\\n")
        elif ch == "\r":
            parts.append("\\r")
        elif ch == "\t":
            parts.append("\\t")
        elif ord(ch) < 0x20:
            parts.append("\\u%04x" % ord(ch))
        else:
            parts.append(ch)
    parts.append('"')
    return "".join(parts)


UNDEFINED = object()  # stands in for JavaScript undefined in test vectors


def canonical_json(value):
    if value is UNDEFINED:
        raise HashError("E_UNDEFINED")
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            raise HashError("E_NONFINITE")
        raise HashError("E_FLOAT", "float values are not allowed in hash inputs")
    if isinstance(value, int):
        if not -MAX_SAFE <= value <= MAX_SAFE:
            raise HashError("E_UNSAFE_INT")
        return str(value)
    if isinstance(value, str):
        return _json_string(value)
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(canonical_json(v) for v in value) + "]"
    if isinstance(value, dict):
        for k in value:
            if not isinstance(k, str):
                raise HashError("E_TYPE", "non-string key")
            _check_scalar_values(k)
        # Python compares str by code point, which is the spec order.
        items = sorted(value.items(), key=lambda kv: kv[0])
        return "{" + ",".join(_json_string(k) + ":" + canonical_json(v) for k, v in items) + "}"
    raise HashError("E_TYPE", type(value).__name__)


def validate_bundle_path(p):
    if p == "" or "\x00" in p:
        raise HashError("E_PATH_INVALID", "empty or NUL")
    if p.startswith("/"):
        raise HashError("E_PATH_ESCAPE", "absolute")
    if "\\" in p:
        raise HashError("E_PATH_INVALID", "backslash")
    segments = p.split("/")
    if ".." in segments:
        raise HashError("E_PATH_ESCAPE", "traversal")
    if any(seg in ("", ".") for seg in segments):
        raise HashError("E_PATH_INVALID", "empty or dot segment")
    if not unicodedata.is_normalized("NFC", p):
        raise HashError("E_PATH_INVALID", "not NFC")


def source_manifest(doc_id, files):
    """files: iterable of (path, kind, content_bytes); kind is 'text' or 'binary'."""
    if not UUID_V4.fullmatch(doc_id):
        raise HashError("E_DOCID")
    seen = set()
    entries = []
    for path, kind, content in files:
        validate_bundle_path(path)
        if path in seen:
            raise HashError("E_PATH_DUPLICATE", path)
        seen.add(path)
        digest = sha256_hex(normalize_text(content).encode("utf-8")) if kind == "text" else sha256_hex(content)
        entries.append({"path": path, "sha256": digest})
    if "index.md" not in seen:
        raise HashError("E_MANIFEST", "index.md is required")
    entries.sort(key=lambda e: e["path"])
    return {"schema": "visser-source-manifest/1", "docId": doc_id, "files": entries}


def source_revision(doc_id, files):
    canonical = canonical_json(source_manifest(doc_id, files))
    return {"canonical": canonical, "sourceRevision": sha256_hex(canonical.encode("utf-8"))}


def _hex(name, v):
    if not isinstance(v, str) or not HEX64.fullmatch(v):
        raise HashError("E_HASH", name)
    return v


def build_id(source_rev, toolkit_sha256, extension_digests, effective_render_options):
    _hex("sourceRevision", source_rev)
    _hex("toolkitSha256", toolkit_sha256)
    ext = [_hex("extensionDigest", d) for d in extension_digests]
    if len(set(ext)) != len(ext):
        raise HashError("E_DUPLICATE_DIGEST")
    canonical = canonical_json({
        "schema": "visser-build-input/1",
        "sourceRevision": source_rev,
        "toolkitSha256": toolkit_sha256,
        "extensionDigests": sorted(ext),
        "effectiveRenderOptions": effective_render_options,
    })
    return {"canonical": canonical, "buildId": sha256_hex(canonical.encode("utf-8"))}


def _check_ref(doc_id, target_id, rev, body):
    for ok, what in (
        (isinstance(doc_id, str) and UUID_V4.fullmatch(doc_id), "docId"),
        (isinstance(target_id, str) and TARGET_ID.fullmatch(target_id), "targetId"),
        (isinstance(rev, str) and HEX64.fullmatch(rev), "rev"),
        (isinstance(body, str) and HEX64.fullmatch(body), "body"),
    ):
        if not ok:
            raise HashError("E_REF_INVALID", what)


def build_reference_uri(doc_id, target_id, rev, body):
    _check_ref(doc_id, target_id, rev, body)
    return "visser://%s/%s?rev=%s&body=%s" % (doc_id, target_id, rev, body)


def parse_reference_uri(raw):
    def bad(why):
        raise HashError("E_REF_INVALID", why)

    if not re.fullmatch(r"[\x21-\x7e]*", raw):
        bad("non-ASCII, space, or control")
    try:
        parts = urllib.parse.urlsplit(raw)
        port = parts.port
    except ValueError:
        bad("unparseable")
    if parts.scheme != "visser":  # urlsplit lowercases the scheme
        bad("scheme")
    if "#" in raw:
        bad("fragment")
    if parts.username is not None or parts.password is not None:
        bad("credentials")
    if port is not None or parts.netloc.endswith(":"):
        bad("port")
    if "%" in parts.path:
        bad("percent-encoding in path")
    segments = parts.path.split("/")
    if len(segments) != 2 or segments[0] != "":
        bad("path segments")
    pairs = urllib.parse.parse_qsl(parts.query, keep_blank_values=True, strict_parsing=False)
    keys = [k for k, _ in pairs]
    if sorted(keys) != ["body", "rev"]:
        bad("query keys")
    q = dict(pairs)
    doc_id, target_id, rev, body = parts.netloc, segments[1], q["rev"], q["body"]
    _check_ref(doc_id, target_id, rev, body)
    if build_reference_uri(doc_id, target_id, rev, body) != raw:
        bad("not canonical form")
    return {"docId": doc_id, "targetId": target_id, "rev": rev, "body": body}
