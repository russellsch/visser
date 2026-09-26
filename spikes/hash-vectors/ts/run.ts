// Run every vector through the TypeScript implementation and print results as JSON.
import { readFileSync } from "node:fs";
import {
  HashError, bodySha256, buildId, buildReferenceUri, canonicalJSON, normalizeText,
  parseReferenceUri, sha256Hex, sourceRevision,
} from "./explainHash.ts";

const vectors = JSON.parse(readFileSync(new URL("../vectors.json", import.meta.url), "utf8"));
const fromB64 = (s: string) => new Uint8Array(Buffer.from(s, "base64"));
const SPECIAL: Record<string, unknown> = { nan: NaN, infinity: Infinity, undefined: undefined };

function run(c: any): Record<string, unknown> {
  switch (c.op) {
    case "text": {
      const normalized = normalizeText(fromB64(c.bytesB64));
      return {
        normalizedB64: Buffer.from(normalized, "utf8").toString("base64"),
        bodySha256: bodySha256(fromB64(c.bytesB64)),
      };
    }
    case "cjson": {
      const value = "special" in c ? SPECIAL[c.special] : JSON.parse(c.json);
      const canonical = canonicalJSON(value);
      return { canonical, sha256: sha256Hex(Buffer.from(canonical, "utf8")) };
    }
    case "srcrev":
      return sourceRevision(c.docId, c.files.map((f: any) => ({ path: f.path, kind: f.kind, content: fromB64(f.contentB64) })));
    case "buildid":
      return buildId(c.input);
    case "uri_build":
      return { uri: buildReferenceUri(c.input) };
    case "uri_parse":
      return { parts: parseReferenceUri(c.uri) };
    default:
      throw new Error(`unknown op ${c.op}`);
  }
}

const results: Record<string, unknown> = {};
for (const c of vectors.cases) {
  try {
    results[c.id] = { ok: true, ...run(c) };
  } catch (e) {
    if (!(e instanceof HashError)) throw e;
    results[c.id] = { ok: false, error: e.code };
  }
}
process.stdout.write(JSON.stringify({ implementation: "ts", node: process.version, results }, null, 1) + "\n");
