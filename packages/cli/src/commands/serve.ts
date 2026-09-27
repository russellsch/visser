// `visser serve DOC [--port N] [--host H] [--public-origin URL] [--base-path P]
//   [--cache-private] [--toolkit-dir DIR | --dev-toolkit DIR]` (§13.3, §13.4).
// Builds a snapshot, then serves only the files in its output manifest.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CliError, EXIT, type ParsedArgs, stringFlag } from '../cli-util.ts';
import { type Route, serveArtifacts } from '../server.ts';
import { contentSecurityPolicy } from '../../../core/src/compiler/compile.ts';
import { buildDocument } from './build.ts';

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

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
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

  const outcome = await buildDocument(args);
  const { result, outDir, toolkit } = outcome;
  const routes = new Map<string, Route>();
  const add = (sitePath: string, bytes: Uint8Array, cache: Route['cache'], csp?: string) => {
    const ext = sitePath.slice(sitePath.lastIndexOf('.'));
    routes.set(basePath + sitePath, { bytes, mediaType: MEDIA[ext] ?? 'application/octet-stream', cache, ...(csp ? { csp } : {}) });
  };
  // A page with a Mermaid figure gets the Mermaid-page policy; other routes keep the strict one (§9.12).
  const pageCsp = result.needsMermaid ? contentSecurityPolicy({ mermaid: true, delivery: 'header' }) : undefined;
  const snapshotCache: Route['cache'] = args.flags.has('cache-private') ? 'immutable' : 'no-store';
  for (const file of result.files) {
    const html = file.path.endsWith('.html');
    add(file.path, file.bytes, html ? snapshotCache : 'immutable', html ? pageCsp : undefined);
  }
  for (const name of ['reader.js', 'reader.css', ...(result.needsMermaid ? ['mermaid.js'] : [])]) {
    add(`_visser/assets/${toolkit.release.sha256}/${name}`, readFileSync(join(outDir, '_visser', 'assets', toolkit.release.sha256, name)), 'immutable');
  }
  const title = typeof outcome.frontmatter['title'] === 'string' ? outcome.frontmatter['title'] : result.docId;
  const index = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>\n<body><p><a href="${escapeHtml(outcome.snapshotPath)}">${escapeHtml(title)}</a></p></body></html>\n`;
  routes.set(basePath, { bytes: new TextEncoder().encode(index), mediaType: 'text/html; charset=utf-8', cache: 'no-cache' });

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
  process.stdout.write(`serving ${base}${outcome.snapshotPath}\n  docId: ${result.docId}\n  source revision: ${result.sourceRevision}\n  build ID: ${result.buildId}\n`);
  if (!LOOPBACK.has(host) || publicOrigin) {
    const visibility = outcome.frontmatter['visibility'] ?? 'private';
    if (visibility === 'private') {
      process.stderr.write('warning: this private document is reachable beyond loopback; Visser adds no authentication (§13.4)\n');
    }
  }
  await new Promise<void>((resolveStop) => {
    const stop = () => { handle.close().then(resolveStop); };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  return EXIT.ok;
}
