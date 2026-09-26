// Shows what a naive implementation (JavaScript default sort) would produce for s_sort_order.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { sourceManifest, canonicalJSON } from "./ts/explainHash.ts";
const c = JSON.parse(readFileSync("vectors.json", "utf8")).cases.find((x: any) => x.id === "s_sort_order");
const m = sourceManifest(c.docId, c.files.map((f: any) => ({ path: f.path, kind: f.kind, content: new Uint8Array(Buffer.from(f.contentB64, "base64")) })));
const naive = { ...m, files: [...m.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) };
const h = (o: unknown) => createHash("sha256").update(canonicalJSON(o)).digest("hex");
console.log("spec order :", m.files.map((f) => f.path).join(", "), "\n  revision", h(m));
console.log("naive order:", naive.files.map((f) => f.path).join(", "), "\n  revision", h(naive));
