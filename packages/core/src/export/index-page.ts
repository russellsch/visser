// The collection index page (§13.1, §13.5): relative links, escaped titles,
// its own Content Security Policy meta, and no script.
import { h, render } from '../compiler/html.ts';

export type IndexEntry = { title: string; path: string };

/** No script at all; styles only from the same-origin asset pack. */
export const COLLECTION_CSP = "default-src 'none'; style-src 'self'; img-src 'none'; base-uri 'none'; form-action 'none'";

/**
 * @param stylesheet site-relative path of reader.css in an asset pack
 * @param stylesheetSha256 hex digest of that file, for its integrity attribute
 */
export function collectionIndexHtml(title: string, entries: readonly IndexEntry[], options: { audience: 'private' | 'public'; stylesheet: string; stylesheetSha256: string }): string {
  const integrity = `sha256-${Buffer.from(options.stylesheetSha256, 'hex').toString('base64')}`;
  const page = h('html', { lang: 'en' },
    h('head', {},
      h('meta', { charset: 'utf-8' }),
      h('meta', { 'http-equiv': 'Content-Security-Policy', content: COLLECTION_CSP }),
      h('meta', { name: 'referrer', content: 'no-referrer' }),
      h('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }),
      options.audience === 'private' ? h('meta', { name: 'robots', content: 'noindex, nofollow' }) : null,
      h('title', {}, title),
      h('link', { rel: 'stylesheet', href: options.stylesheet, integrity })),
    h('body', {},
      h('main', { class: 'vs-collection' },
        h('h1', {}, title),
        h('ul', {}, entries.map((e) => h('li', {}, h('a', { href: e.path }, e.title)))))));
  return '<!doctype html>\n' + render(page) + '\n';
}
