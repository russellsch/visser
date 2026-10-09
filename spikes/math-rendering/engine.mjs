// W0 only: identical deterministic conversion in Node and a bundled browser.
import { mathjax } from '@mathjax/src/js/mathjax.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import { SVG } from '@mathjax/src/js/output/svg.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import { MathJaxTexFont } from '@mathjax/mathjax-tex-font/js/svg.js';
import '@mathjax/src/js/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

export function convert(tex, display = false) {
  // Fresh input state: no macro definitions may leak to another equation.
  const input = new TeX({ packages: ['base', 'ams'], maxBuffer: 16384,
    formatError(_jax, error) { throw error; } });
  const output = new SVG({ fontData: MathJaxTexFont, fontCache: 'none', linebreaks: { inline: false } });
  const doc = mathjax.document('', { InputJax: input, OutputJax: output });
  const result = doc.convert(tex, { display, em: 16, ex: 8, containerWidth: 1280 });
  const svg = adaptor.firstChild(result);
  if (adaptor.childNodes(result).length !== 1) throw new Error('Expected one indivisible SVG equation');
  const attrs = Object.fromEntries(adaptor.allAttributes(svg).map(({name, value}) => [name, value]));
  return { markup: adaptor.outerHTML(result), attrs };
}
