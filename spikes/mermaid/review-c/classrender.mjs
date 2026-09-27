import { readFileSync } from 'node:fs';
import { runCases } from './harness.mjs';
const r = await runCases({ class_example: readFileSync('class-example/class.mmd', 'utf8') });
console.log(JSON.stringify(r.map((x) => ({ accepted: x.accepted, err: x.err, anchors: x.anchors, off: x.off, labels: x.labels }))));
