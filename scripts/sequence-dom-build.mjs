// Relocatable Node-only DOM for sequence sanitization. Browser bundles must
// never use this plugin. Re-audit exact artifacts on dependency updates.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}
function once(source, before, after, path) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: expected one patch target; found ${count}`);
  return source.replace(before, after);
}
export function sequenceDomAliases(root) {
  return {
    dompurify: resolve(root, 'packages/core/src/mermaid/dompurify-stub.ts'),
    'dompurify/purify.js': resolve(root, 'node_modules/dompurify/dist/purify.js'),
  };
}
const cssPrelude = 'const fs = require("node:fs");\nconst path = require("node:path");\n';
const cssRead = 'const defaultStyleSheet = fs.readFileSync(\n  path.resolve(__dirname, "../../../browser/default-stylesheet.css"),\n  { encoding: "utf-8" }\n);';
const xhrWorker = 'const syncWorkerFile = require.resolve("./xhr-sync-worker.js");\n\nlet syncWorker = null;\n\nfunction getSyncWorker() {\n  if (!syncWorker) {\n    syncWorker = new Worker(syncWorkerFile);\n    syncWorker.unref();\n    syncWorker.on("exit", () => {\n      syncWorker = null;\n    });\n  }\n  return syncWorker;\n}';

export function sequenceDomPlugin(root, { required = true } = {}) {
  const cssFile = resolve(root, 'node_modules/jsdom/lib/jsdom/browser/default-stylesheet.css');
  return {
    name: 'visser-isolated-jsdom',
  setup(buildApi) {
    let cssCount = 0;
    let xhrCount = 0;
    buildApi.onStart(() => { cssCount = 0; xhrCount = 0; });
    buildApi.onLoad({ filter: /[/\\]computed-style\.js$/ }, ({ path }) => {
      if (sha256(path) !== "3cb3007707b27a4d8ea8e78d790925f74ae0d805e2a7110c43d29db0669d12d0") {
        throw new Error("jsdom computed-style artifact changed; re-audit stylesheet embedding");
      }
      if (sha256(cssFile) !== '77d85908fdeb5b671e9a20d763847b7647c611d1fee1f8591361e3a4244cef33') throw new Error('jsdom default stylesheet changed; re-audit embedding');
      cssCount++;
      let source = readFileSync(path, "utf8");
      source = once(source, cssPrelude, "", path);
      source = once(source, cssRead, `const defaultStyleSheet = ${JSON.stringify(readFileSync(cssFile, "utf8"))};`, path);
      return { contents: source, loader: "js" };
    });
    buildApi.onLoad({ filter: /[/\\]XMLHttpRequest-impl\.js$/ }, ({ path }) => {
      if (sha256(path) !== "6fd6e204c59a0fe05fa93e48553efde0d9603f7df525d8432a3261fa77e7f6f7") {
        throw new Error("jsdom XMLHttpRequest artifact changed; re-audit worker disablement");
      }
      xhrCount++;
      const source = once(readFileSync(path, "utf8"), xhrWorker,
        'let syncWorker = null;\n\nfunction getSyncWorker() {\n  throw new Error("Synchronous XMLHttpRequest is disabled in the isolated parser DOM");\n}', path);
      return { contents: source, loader: "js" };
    });
    buildApi.onEnd(result => {
      if (!result.errors.length && (required || cssCount || xhrCount) && (cssCount !== 1 || xhrCount !== 1)) {
        throw new Error(`Expected exactly one stylesheet and XHR patch; got ${cssCount}/${xhrCount}`);
      }
    });
  }
  };
}
