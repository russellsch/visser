// Spike implementation of ARCHITECTURE.md §7.4 hashing and the §11.2 reference URI.
// Written from the spec text only; see ../FINDINGS.md for the choices made where the
// spec was silent. Node built-ins only.
import { createHash } from "node:crypto";

export class HashError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const HEX64 = /^[0-9a-f]{64}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TARGET_ID = /^[a-z][a-z0-9_-]{0,63}$/;

export function sha256Hex(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

// Text normalization: strict UTF-8, remove one leading BOM, CRLF and CR to LF.
export function normalizeText(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new HashError("E_UTF8", "invalid UTF-8");
  }
  if (text.startsWith("﻿")) text = text.slice(1);
  return text.replace(/\r\n?/g, "\n");
}

export function bodySha256(spanBytes: Uint8Array): string {
  return sha256Hex(Buffer.from(normalizeText(spanBytes), "utf8"));
}

// Code-point comparison. JavaScript's default comparison uses UTF-16 code units,
// which orders U+10000.. before U+E000..U+FFFF; that is not the spec order.
export function compareCodePoints(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

function assertWellFormed(s: string): void {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (!(d >= 0xdc00 && d <= 0xdfff)) throw new HashError("E_LONE_SURROGATE", "lone high surrogate");
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      throw new HashError("E_LONE_SURROGATE", "lone low surrogate");
    }
  }
}

const SHORT_ESCAPES: Record<string, string> = {
  '"': '\\"', "\\": "\\\\", "\b": "\\b", "\f": "\\f", "\n": "\\n", "\r": "\\r", "\t": "\\t",
};

function quote(s: string): string {
  assertWellFormed(s);
  let out = '"';
  for (const ch of s) {
    const short = SHORT_ESCAPES[ch];
    if (short !== undefined) out += short;
    else if (ch.charCodeAt(0) < 0x20) out += "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0");
    else out += ch;
  }
  return out + '"';
}

export function canonicalJSON(value: unknown): string {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (value === undefined) throw new HashError("E_UNDEFINED", "undefined is not allowed");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new HashError("E_NONFINITE", "NaN or Infinity");
    if (!Number.isInteger(value)) throw new HashError("E_FLOAT", "floating-point number");
    if (!Number.isSafeInteger(value)) throw new HashError("E_UNSAFE_INT", "integer outside safe range");
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (typeof value === "string") return quote(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJSON).join(",") + "]";
  if (typeof value === "object") {
    const keys = Object.keys(value as object);
    keys.forEach(assertWellFormed);
    keys.sort(compareCodePoints);
    const obj = value as Record<string, unknown>;
    return "{" + keys.map((k) => quote(k) + ":" + canonicalJSON(obj[k])).join(",") + "}";
  }
  throw new HashError("E_TYPE", `unsupported type ${typeof value}`);
}

// Bundle-relative path rules (choices recorded in FINDINGS.md, decision D5).
export function validateBundlePath(p: string): void {
  if (p.length === 0 || p.includes("\u0000")) throw new HashError("E_PATH_INVALID", "empty or NUL");
  if (p.startsWith("/")) throw new HashError("E_PATH_ESCAPE", "absolute path");
  if (p.includes("\\")) throw new HashError("E_PATH_INVALID", "backslash");
  const segments = p.split("/");
  if (segments.includes("..")) throw new HashError("E_PATH_ESCAPE", "traversal");
  if (segments.some((s) => s === "" || s === ".")) throw new HashError("E_PATH_INVALID", "empty or dot segment");
  if (p.normalize("NFC") !== p) throw new HashError("E_PATH_INVALID", "not NFC");
}

export type BundleFile = { path: string; kind: "text" | "binary"; content: Uint8Array };

export function sourceManifest(docId: string, files: BundleFile[]) {
  if (!UUID_V4.test(docId)) throw new HashError("E_DOCID", "docId is not a lowercase UUIDv4");
  const seen = new Set<string>();
  const entries = files.map((f) => {
    validateBundlePath(f.path);
    if (seen.has(f.path)) throw new HashError("E_PATH_DUPLICATE", `duplicate path ${f.path}`);
    seen.add(f.path);
    const digest = f.kind === "text"
      ? sha256Hex(Buffer.from(normalizeText(f.content), "utf8"))
      : sha256Hex(f.content);
    return { path: f.path, sha256: digest };
  });
  if (!seen.has("index.md")) throw new HashError("E_MANIFEST", "index.md is required");
  entries.sort((a, b) => compareCodePoints(a.path, b.path));
  return { schema: "visser-source-manifest/1", docId, files: entries };
}

export function sourceRevision(docId: string, files: BundleFile[]) {
  const canonical = canonicalJSON(sourceManifest(docId, files));
  return { canonical, sourceRevision: sha256Hex(Buffer.from(canonical, "utf8")) };
}

function assertHex(name: string, v: unknown): string {
  if (typeof v !== "string" || !HEX64.test(v)) throw new HashError("E_HASH", `${name} is not 64 lowercase hex`);
  return v;
}

export function buildId(input: {
  sourceRevision: string; toolkitSha256: string; extensionDigests: string[]; effectiveRenderOptions: Record<string, unknown>;
}) {
  assertHex("sourceRevision", input.sourceRevision);
  assertHex("toolkitSha256", input.toolkitSha256);
  const ext = input.extensionDigests.map((d, i) => assertHex(`extensionDigests[${i}]`, d));
  if (new Set(ext).size !== ext.length) throw new HashError("E_DUPLICATE_DIGEST", "duplicate extension digest");
  ext.sort(compareCodePoints);
  const canonical = canonicalJSON({
    schema: "visser-build-input/1",
    sourceRevision: input.sourceRevision,
    toolkitSha256: input.toolkitSha256,
    extensionDigests: ext,
    effectiveRenderOptions: input.effectiveRenderOptions,
  });
  return { canonical, buildId: sha256Hex(Buffer.from(canonical, "utf8")) };
}

export type RefParts = { docId: string; targetId: string; rev: string; body: string };

function validateRefParts(p: RefParts): void {
  if (!UUID_V4.test(p.docId)) throw new HashError("E_REF_INVALID", "docId");
  if (!TARGET_ID.test(p.targetId)) throw new HashError("E_REF_INVALID", "targetId");
  if (!HEX64.test(p.rev)) throw new HashError("E_REF_INVALID", "rev");
  if (!HEX64.test(p.body)) throw new HashError("E_REF_INVALID", "body");
}

export function buildReferenceUri(p: RefParts): string {
  validateRefParts(p);
  return `visser://${p.docId}/${p.targetId}?rev=${p.rev}&body=${p.body}`;
}

// Decision D10: after structural checks with a real URL parser, accept only the exact
// canonical byte form (the tool always emits it; anything else is not a tool packet).
export function parseReferenceUri(raw: string): RefParts {
  const bad = (why: string): never => { throw new HashError("E_REF_INVALID", why); };
  if (!/^[\x21-\x7e]*$/.test(raw)) bad("non-ASCII, space, or control character");
  let url: URL;
  try { url = new URL(raw); } catch { return bad("unparseable"); }
  if (url.protocol !== "visser:") bad("scheme");
  if (raw.includes("#")) bad("fragment");
  if (url.username !== "" || url.password !== "") bad("credentials");
  if (url.port !== "") bad("port");
  const segments = url.pathname.split("/");
  if (segments.length !== 2 || segments[0] !== "") bad("path segments");
  if (url.pathname.includes("%")) bad("percent-encoding in path");
  const keys = [...url.searchParams.keys()];
  if (keys.length !== 2 || new Set(keys).size !== 2 || !keys.includes("rev") || !keys.includes("body")) bad("query keys");
  const parts: RefParts = {
    docId: url.host, targetId: segments[1],
    rev: url.searchParams.get("rev") ?? "", body: url.searchParams.get("body") ?? "",
  };
  validateRefParts(parts);
  if (buildReferenceUri(parts) !== raw) bad("not canonical form");
  return parts;
}
