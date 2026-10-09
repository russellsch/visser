// `visser serve DOC [--port N] [--host H] [--public-origin URL] [--base-path P]
//   [--cache-private] [--toolkit-dir DIR | --dev-toolkit DIR] [--watch]` (§13.3, §13.4).
// Builds a snapshot, then serves only the files in its output manifest.
// `--watch` rebuilds when index.md, visser.lock.json, or any declared bundle
// file changes (a 200 ms debounce over an `fs.watch` on the bundle folder),
// swaps the served routes to the new snapshot, and keeps the latest snapshot
// also reachable at the stable `<base-path>latest/` path (dogfood-3 F12b).
import { readFileSync, watch } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { CliError, EXIT, type ParsedArgs, stringFlag } from '../cli-util.ts';
import { type Route, serveArtifacts } from '../server.ts';
import { contentSecurityPolicy } from '../../../core/src/compiler/compile.ts';
import { loadBundle } from '../../../core/src/model/bundle.ts';
import { buildDocument, type BuildOutcome } from './build.ts';

const MEDIA: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

// A small monochrome mark, served as a byte constant so the page never 404s
// on the browser's automatic /favicon.ico request and no request leaves the
// machine to fetch one (dogfood-3 F12c).
const FAVICON_SVG = new TextEncoder().encode(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#1f6feb"/>' +
    '<text x="16" y="23" font-family="sans-serif" font-size="18" font-weight="bold" fill="#fff" text-anchor="middle">V</text></svg>\n',
);

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** The routes for one build: the snapshot's own files, the shared asset pack, and the `/` index. */
function buildRoutes(outcome: BuildOutcome, basePath: string, cachePrivate: boolean): Map<string, Route> {
  const { result, outDir, toolkit } = outcome;
  const routes = new Map<string, Route>();
  const add = (sitePath: string, bytes: Uint8Array, cache: Route['cache'], csp?: string) => {
    const ext = sitePath.slice(sitePath.lastIndexOf('.'));
    routes.set(basePath + sitePath, { bytes, mediaType: MEDIA[ext] ?? 'application/octet-stream', cache, ...(csp ? { csp } : {}) });
  };
  // A page with a Mermaid figure gets the Mermaid-page policy; other routes keep the strict one (§9.12).
  const pageCsp = result.needsMermaid || result.needsMath ? contentSecurityPolicy({ mermaid: result.needsMermaid, math: result.needsMath, delivery: 'header' }) : undefined;
  const snapshotCache: Route['cache'] = cachePrivate ? 'immutable' : 'no-store';
  for (const file of result.files) {
    const html = file.path.endsWith('.html');
    add(file.path, file.bytes, html ? snapshotCache : 'immutable', html ? pageCsp : undefined);
  }
  for (const name of ['reader.js', 'reader.css', ...(result.needsMermaid ? ['mermaid.js'] : []), ...(result.needsMath ? ['math.js'] : [])]) {
    add(`_visser/assets/${toolkit.release.sha256}/${name}`, readFileSync(join(outDir, '_visser', 'assets', toolkit.release.sha256, name)), 'immutable');
  }
  const title = typeof outcome.frontmatter['title'] === 'string' ? outcome.frontmatter['title'] : result.docId;
  const index = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>\n<body><p><a href="${escapeHtml(outcome.snapshotPath)}">${escapeHtml(title)}</a></p></body></html>\n`;
  routes.set(basePath, { bytes: new TextEncoder().encode(index), mediaType: 'text/html; charset=utf-8', cache: 'no-cache' });
  routes.set('/favicon.ico', { bytes: FAVICON_SVG, mediaType: 'image/svg+xml', cache: 'immutable' });
  // A stable URL for the latest snapshot, so a --watch author keeps one link
  // open across rebuilds: a client-side redirect to the current snapshot.
  const latestTarget = basePath + outcome.snapshotPath;
  const latest = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=${escapeHtml(latestTarget)}">` +
    `<title>${escapeHtml(title)}</title></head>\n<body><p><a href="${escapeHtml(latestTarget)}">${escapeHtml(title)}</a> (build ${escapeHtml(result.buildId)})</p></body></html>\n`;
  routes.set(`${basePath}latest/`, { bytes: new TextEncoder().encode(latest), mediaType: 'text/html; charset=utf-8', cache: 'no-store' });
  return routes;
}

export async function runServe(args: ParsedArgs): Promise<number> {
  const host = stringFlag(args, 'host') ?? '127.0.0.1';
  const portText = stringFlag(args, 'port') ?? '4310';
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new CliError('E_USAGE', `--port must be an integer from 0 to 65535, not ${portText}`, EXIT.invalid);
  }
  const publicOrigin = stringFlag(args, 'public-origin');
  const basePath = (stringFlag(args, 'base-path') ?? '/').replace(/\/?$/, '/');
  if (!basePath.startsWith('/')) throw new CliError('E_USAGE', '--base-path must start with /', EXIT.invalid);

  const cachePrivate = args.flags.has('cache-private');
  let outcome = await buildDocument(args);
  const routes = buildRoutes(outcome, basePath, cachePrivate);

  let handle;
  try {
    handle = await serveArtifacts(routes, host, port, { publicOrigins: publicOrigin ? [publicOrigin] : [] });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EADDRINUSE') {
      throw new CliError('E_PORT_BUSY', `port ${port} is busy; choose another --port (0 picks a free port)`, EXIT.unavailable);
    }
    throw error;
  }
  const shownHost = host.includes(':') ? `[${host}]` : host;
  const base = `http://${shownHost}:${handle.port}${basePath}`;
  process.stdout.write(`serving ${base}${outcome.snapshotPath}\n  docId: ${outcome.result.docId}\n  source revision: ${outcome.result.sourceRevision}\n  build ID: ${outcome.result.buildId}\n`);
  if (!LOOPBACK.has(host) || publicOrigin) {
    const visibility = outcome.frontmatter['visibility'] ?? 'private';
    if (visibility === 'private') {
      process.stderr.write('warning: this private document is reachable beyond loopback; Visser adds no authentication (§13.4)\n');
    }
  }

  let watcher: ReturnType<typeof watch> | undefined;
  if (args.flags.has('watch')) {
    const indexPath = resolve(args.positional[0]!);
    const bundleRoot = dirname(indexPath);
    // The files a rebuild is triggered by: the declared bundle files (which
    // includes index.md) plus visser.lock.json, whether or not it exists yet.
    // Anything else in the folder, including the build's own `.visser/`
    // output, is ignored (dogfood-3 F12b).
    let declared = new Set(loadBundle(indexPath).files.map((f) => f.path));
    declared.add('visser.lock.json');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const rebuild = async () => {
      try {
        const next = await buildDocument(args);
        outcome = next;
        const nextRoutes = buildRoutes(next, basePath, cachePrivate);
        routes.clear();
        for (const [path, route] of nextRoutes) routes.set(path, route);
        try {
          declared = new Set(loadBundle(indexPath).files.map((f) => f.path));
          declared.add('visser.lock.json');
        } catch {
          // Keep the previous declared set; the next valid rebuild refreshes it.
        }
        process.stdout.write(`rebuilt ${next.result.buildId}\n`);
      } catch (error) {
        // The previous snapshot keeps serving; only the error is reported.
        process.stderr.write(`error: rebuild failed: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    };
    try {
      watcher = watch(bundleRoot, { recursive: true }, (_event, filename) => {
        if (!filename) return;
        const rel = filename.split(sep).join('/');
        if (rel === '.visser' || rel.startsWith('.visser/')) return; // the build's own output, never a trigger
        if (!declared.has(rel)) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { void rebuild(); }, 200);
      });
    } catch (error) {
      process.stderr.write(`warning: --watch could not observe ${bundleRoot}: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  await new Promise<void>((resolveStop) => {
    const stop = () => { watcher?.close(); handle.close().then(resolveStop); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  return EXIT.ok;
}
