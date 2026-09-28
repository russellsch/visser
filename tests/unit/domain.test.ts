// The `domain` component (docs/IMPROVEMENTS.md §5): validation, the
// relationships it emits, the text projection, the rendering (category cues,
// relation line ends, cardinality, legend, glossary), the route from a term
// to the concept that owns its definition, and the review prompts that point
// to it.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { loadBundle, type LoadedBundle } from '../../packages/core/src/model/bundle.ts';
import { compileDocument } from '../../packages/core/src/compiler/index.ts';
import { firstSentence, projectText } from '../../packages/core/src/model/project.ts';
import { reviewDocument } from '../../packages/core/src/review/index.ts';
import { nativeFor } from '../../packages/core/src/review/shape.ts';
import { layoutGraph, domainCost, DOMAIN_BESIDE_WIDTH, MAX_FIGURE_WIDTH } from '../../packages/core/src/compiler/layout.ts';
import { h, UnsafeMarkupError } from '../../packages/core/src/compiler/html.ts';

const TOOLKIT = { version: '0.0.0', sha256: 'e'.repeat(64) };
const OPTIONS = { audience: 'private' as const, includeSource: false, layoutFallback: false };
const FIXTURE = new URL('../../fixtures/positive/family-domain.md', import.meta.url).pathname;

const work = mkdtempSync(join(tmpdir(), 'visser-domain-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function doc(body: string, frontmatter: string[] = []): string {
  return [
    '---', 'format: visser/1', 'docId: 3a1f0c2e-8b7d-4e6f-9a5b-1c2d3e4f5a6b', 'title: Domain fixture', 'kind: reference',
    'capturedAt: 2026-09-28T00:00:00Z', ...frontmatter, 'visibility: private', '---', '', '<!-- vs:id h_top -->', '# Domain fixture', '', body, '',
  ].join('\n');
}

function load(text: string): LoadedBundle {
  const dir = mkdtempSync(join(work, 'b-'));
  writeFileSync(join(dir, 'index.md'), text);
  return loadBundle(join(dir, 'index.md'));
}

const errors = (text: string) => load(text).diagnostics.filter((d) => d.severity === 'error').map((d) => d.code);

async function html(text: string): Promise<string> {
  const bundle = load(text);
  expect(bundle.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const result = await compileDocument(bundle, TOOLKIT, OPTIONS);
  return new TextDecoder().decode(result.files.find((f) => f.path.endsWith('/index.html'))!.bytes);
}

const DEFS = `{% definition id="def_order" term="order" %}
An order is one request to buy products. It stays open until billing closes it.
{% /definition %}

{% definition id="def_line" term="invoice line" %}
An invoice line bills one product of an order.
{% /definition %}
`;

function domain(children: string, extra = ''): string {
  return `${DEFS}${extra}
{% domain id="dm" title="An order has lines" question="Which things does billing name?" %}
Read this once.

${children}
{% /domain %}
`;
}

const TWO = `{% concept id="c_order" label="Order" definition="def_order" category="thing" attributes=["id", "state"] /%}
{% concept id="c_line" label="Invoice line" definition="def_line" category="event" /%}`;

describe('domain validation (IMPROVEMENTS.md §5.3)', () => {
  it('the positive fixture and a minimal model check with no errors', () => {
    expect(load(readFileSync(FIXTURE, 'utf8')).diagnostics.filter((d) => d.severity !== 'warning' || d.code !== 'W_UNDECLARED_FILE')).toEqual([]);
    expect(errors(doc(domain(`${TWO}\n{% relation id="r_has" from="c_order" to="c_line" kind="has" label="contains" cardinality="1..*" /%}`)))).toEqual([]);
  });

  it('`definition` is required and must name a definition block (E_REF_BROKEN)', () => {
    expect(errors(doc(domain('{% concept id="c_x" label="X" /%}')))).toEqual(['E_SYNTAX']);
    expect(errors(doc(domain('{% concept id="c_x" label="X" definition="def_missing" /%}')))).toEqual(['E_REF_BROKEN']);
    expect(errors(doc(domain('{% concept id="c_x" label="X" definition="p_note" /%}', '\n<!-- vs:id p_note -->\nA note.\n')))).toEqual(['E_REF_BROKEN']);
  });

  it('one definition has one owner (E_SEMANTIC)', () => {
    const bundle = load(doc(domain(`${TWO}\n{% concept id="c_purchase" label="Purchase" definition="def_order" /%}`)));
    const found = bundle.diagnostics.filter((d) => d.severity === 'error');
    expect(found.map((d) => [d.code, d.targetId])).toEqual([['E_SEMANTIC', 'c_purchase']]);
    expect(found[0]!.message).toContain('c_order already owns');
  });

  it('relation endpoints are concepts in the same figure', () => {
    expect(errors(doc(domain(`${TWO}\n{% relation id="r_x" from="c_order" to="def_line" kind="has" label="holds" /%}`)))).toEqual(['E_REF_BROKEN']);
    const other = `${domain(TWO)}\n{% definition id="def_product" term="product" %}\nA product is one item.\n{% /definition %}\n\n{% domain id="dm2" title="T" question="Q?" %}\nI.\n\n{% concept id="c_product" label="Product" definition="def_product" /%}\n{% relation id="r_x" from="c_line" to="c_product" kind="identifies" label="bills" /%}\n{% /domain %}\n`;
    expect(errors(doc(other))).toEqual(['E_REF_BROKEN']);
  });

  it('`entity` names an architecture node that has no entity itself', () => {
    const map = (nodes: string) => `\n{% graph id="map" mode="architecture" title="Map" question="Where?" %}\nI.\n\n${nodes}\n{% /graph %}\n`;
    const concept = (entity: string) => `{% concept id="c_order" label="Order" definition="def_order" entity="${entity}" /%}`;
    expect(errors(doc(domain(concept('n_order')) + map('{% node id="n_order" label="Order" role="concept" /%}')))).toEqual([]);
    expect(errors(doc(domain(concept('n_alias')) + map('{% node id="n_order" label="Order" role="concept" /%}\n{% node id="n_alias" role="concept" entity="n_order" /%}')))).toEqual(['E_REF_BROKEN']);
    expect(errors(doc(domain(concept('def_line'))))).toEqual(['E_REF_BROKEN']);
  });

  it('enums and placement are checked', () => {
    expect(errors(doc(domain('{% concept id="c_x" label="X" definition="def_order" category="noun" /%}')))).toEqual(['E_SYNTAX']);
    expect(errors(doc(domain(`${TWO}\n{% relation id="r_x" from="c_order" to="c_line" kind="owns" label="holds" /%}`)))).toEqual(['E_SYNTAX']);
    expect(errors(doc(`${DEFS}\n{% concept id="c_x" label="X" definition="def_order" /%}\n`))).toEqual(['E_SYNTAX']);
  });
});

describe('domain relationships and projection (IMPROVEMENTS.md §5.4, ARCHITECTURE.md §9.2)', () => {
  const bundle = load(readFileSync(FIXTURE, 'utf8'));

  it('a relation emits its own `kind`; a concept depends on its definition', () => {
    const rels = bundle.model.relationships.map((r) => [r.id, r.from, r.to, r.kind, r.label]);
    expect(rels).toEqual([
      ['r_is_a', 'c_prepaid', 'c_customer', 'is-a', 'is a kind of'],
      ['r_places', 'c_customer', 'c_order', 'uses', 'places'],
      ['r_has', 'c_order', 'c_line', 'has', 'contains'],
      ['r_emits', 'c_order', 'c_placed', 'produces', 'emits on submit'],
      ['r_price', 'c_price', 'c_line', 'identifies', 'prices'],
    ]);
    expect(bundle.model.targets.get('c_order')!.dependencies).toContain('def_order');
    expect(bundle.model.targets.get('orders_model')!.inspectable).toBe(false);
    expect(bundle.model.targets.get('c_order')!.inspectable).toBe(true);
  });

  it('the text gives the glossary first, then each relation as a sentence', () => {
    const text = projectText(bundle.parsed);
    const figure = text.slice(text.indexOf('<!-- vs:target orders_model -->'));
    expect(figure).toContain('**domain: An order has invoice lines**');
    expect(figure).toContain('<!-- vs:target c_customer -->\nCustomer: A customer is a person or a company that places orders.\ncategory: actor\nAlso called the account holder.');
    expect(figure).toContain('Order: An order is one request from a customer to buy one or more products.\ncategory: thing; attributes: id, state');
    expect(figure).toContain('<!-- vs:target r_has -->\nOrder has Invoice line (1..*): contains\nAn order with no lines is not valid.');
    expect(figure).toContain('Prepaid customer is a Customer: is a kind of');
    expect(figure).toContain('Unit price identifies Invoice line (1): prices');
    expect(figure.indexOf('vs:target c_price')).toBeLessThan(figure.indexOf('vs:target r_is_a'));
  });

  it('firstSentence stops at the first sentence end', () => {
    expect(firstSentence('A target is one block.  It has an ID.')).toBe('A target is one block.');
    expect(firstSentence('No end mark')).toBe('No end mark');
    // A left-out `cite` leaves no space before the punctuation (phase 4 review D6).
    expect(firstSentence('A widget is one part of the handler . It has an ID.')).toBe('A widget is one part of the handler.');
  });
});

describe('domain rendering (IMPROVEMENTS.md §3.2, §5.4)', () => {
  it('hue and shape follow the category; one category shows no hue', async () => {
    const page = await html(readFileSync(FIXTURE, 'utf8'));
    const node = (id: string) => new RegExp(`<(?:a|g) class="([^"]*)"[^>]*id="v-orders_model\\.${id}"[^>]*>(<(?:rect|path)[^>]*>)`).exec(page);
    expect(node('c_customer')![1]).toContain('vs-cat-teal');
    expect(node('c_customer')![2]).toContain('rx="12"');
    expect(node('c_order')![1]).toContain('vs-cat-slate');
    expect(node('c_order')![2]).toContain('rx="6"');
    expect(node('c_placed')![1]).toContain('vs-cat-amber');
    expect(node('c_placed')![2]).toMatch(/^<path d="M/);
    expect(node('c_price')![1]).toContain('vs-cat-green vs-nofill');
    // A value has a second, inner outline: a cue that forced colours keep (phase 4 review D4).
    expect(page).toMatch(/id="v-orders_model\.c_price"[^>]*><rect [^>]*class="vs-shape"><\/rect><rect [^>]*fill="none"[^>]*class="vs-mark vs-mark-double">/);
    expect(page).not.toMatch(/id="v-orders_model\.c_order"[^>]*><rect [^>]*class="vs-shape"><\/rect><rect [^>]*vs-mark-double/);
    // The legend chip of `value` draws the same double outline.
    const chip = /<li class="vs-legend-chip" data-vs-filter="category:value">[\s\S]*?<\/li>/.exec(page)![0];
    expect(chip).toContain('vs-mark-double');
    const one = await html(doc(domain(`{% concept id="c_order" label="Order" definition="def_order" category="rule" /%}\n{% concept id="c_line" label="Invoice line" definition="def_line" category="rule" /%}`)));
    expect(one).not.toContain('vs-cat-violet');
    expect(one).toMatch(/id="v-dm\.c_order"[^>]*><rect [^>]*stroke-dasharray="2 4"/);
  });

  it('a concept box shows its attributes as a muted second line', async () => {
    const page = await html(doc(domain(TWO)));
    expect(page).toMatch(/id="v-dm\.c_order"[\s\S]*?<tspan class="vs-node-meta"[^>]*fill-opacity="0\.72">id, state<\/tspan>/);
  });

  it('relation kinds have their line patterns and line ends; the cardinality follows the label', async () => {
    const page = await html(readFileSync(FIXTURE, 'utf8'));
    const line = (id: string) => new RegExp(`id="v-orders_model\\.${id}"[\\s\\S]*?<path class="vs-line"([^>]*)>`).exec(page)![1]!;
    expect(page).toContain('<marker id="m-orders_model.arrow-triangle"');
    expect(page).toContain('<marker id="m-orders_model.arrow-diamond"');
    expect(line('r_is_a')).toContain('marker-end="url(#m-orders_model.arrow-triangle)"');
    expect(line('r_has')).toContain('marker-start="url(#m-orders_model.arrow-diamond)"');
    expect(line('r_has')).not.toContain('marker-end');
    expect(line('r_places')).toContain('stroke-dasharray="6 4"');
    expect(line('r_places')).toContain('marker-end="url(#m-orders_model.arrow)"');
    expect(line('r_emits')).not.toContain('stroke-dasharray');
    expect(line('r_price')).toContain('stroke-dasharray="2 4"');
    // The cardinality follows the label, so the layout reserves its space (phase 4 review D7).
    expect(page).toMatch(/id="v-orders_model\.r_has"[\s\S]*?<text class="vs-edge-label"[^>]*><tspan[^>]*>contains \u00b7 1\.\.\*<\/tspan>/);
    expect(page).not.toContain('vs-edge-end');
    expect(page).toContain('aria-label="Order, contains, Invoice line (has, cardinality 1..*); opens more detail"');
    // A figure with no is-a and no has relation defines no extra markers.
    const plain = await html(doc(domain(`${TWO}\n{% relation id="r_x" from="c_order" to="c_line" kind="produces" label="emits" /%}`)));
    expect(plain).not.toContain('arrow-triangle');
    expect(plain).not.toContain('arrow-diamond');
  });

  it('the legend has a chip for each category and each relation kind that the figure uses', async () => {
    const page = await html(readFileSync(FIXTURE, 'utf8'));
    const legend = /<ul class="vs-legend"[\s\S]*?<\/ul>/.exec(page)![0];
    const words = [...legend.matchAll(/<span class="vs-legend-word">([^<]+)<\/span>/g)].map((m) => m[1]);
    expect(words).toEqual(['thing', 'actor', 'event', 'value', 'is-a', 'has', 'uses', 'produces', 'identifies']);
  });

  it('the glossary has one row per concept, and the lists hold only the relations', async () => {
    const page = await html(readFileSync(FIXTURE, 'utf8'));
    expect(page).toContain('data-vs-views="map list"');
    const body = /<div class="vs-domain-body">[\s\S]*?<\/table><\/div><\/div>/.exec(page)![0];
    expect(body.indexOf('class="vs-viewport"')).toBeLessThan(body.indexOf('class="vs-glossary"'));
    // The term cell names the category in muted text (phase 4 review D5).
    const tbody = /<tbody>([\s\S]*?)<\/tbody>/.exec(body)![1]!;
    const rows = [...tbody.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((row) => {
      const markup = row[1]!;
      const term = /<a class="vs-glossary-term"[^>]*data-vs-target="([^"]+)"[^>]*>([^<]+)[\s\S]*?<\/a>/.exec(markup)!;
      const category = /<span class="vs-role" data-vs-generated=""> \((\w+)\)<\/span>/.exec(markup)?.[1];
      const meaning = /<\/th><td>([\s\S]*?)<\/td>/.exec(markup)![1]!.replace(/<[^>]+>/g, '');
      const more = /<td class="vs-glossary-more"><a class="vs-inspect-link" href="#x-([^"]+)"/.exec(markup)![1];
      return [term[1], term[2], category, meaning, more];
    });
    expect(rows).toEqual([
      ['c_customer', 'Customer', 'actor', 'A customer is a person or a company that places orders.', 'c_customer'],
      ['c_prepaid', 'Prepaid customer', 'actor', 'A prepaid customer pays before the order ships.', 'c_prepaid'],
      ['c_order', 'Order', 'thing', 'An order is one request from a customer to buy one or more products.', 'c_order'],
      ['c_line', 'Invoice line', 'thing', 'An invoice line bills one product of an order at the price on the order date.', 'c_line'],
      ['c_placed', 'Order placed', 'event', 'Order placed is the event that starts billing.', 'c_placed'],
      ['c_price', 'Unit price', 'value', 'A unit price is an amount of money for one unit of a product.', 'c_price'],
    ]);
    // The term of a row is not linked inside its own meaning.
    expect(/id="l-orders_model\.c_order"[\s\S]*?<td>([\s\S]*?)<\/td>/.exec(page)![1]).not.toContain('data-vs-term="def_order"');
    const lists = /<div class="vs-lists">([\s\S]*?)<\/div><\/figure>/.exec(page)![1]!;
    expect(lists).toContain('aria-label="Relations"');
    expect(lists).not.toContain('vs-node-list');
    expect(lists).toContain('(cardinality: 1..*)');
  });

  it('keeps a definition reachable from the map but avoids a redundant one-sentence glossary drill-down', async () => {
    const page = await html(doc(`{% definition id="def_only" term="queue" %}
A queue stores work.
{% /definition %}

{% domain id="dm" title="Queue" question="What is it?" %}
{% concept id="c_queue" label="Queue" definition="def_only" category="thing" /%}
{% /domain %}`));
    expect(page).toMatch(/<a class="vs-node"[^>]*id="v-dm\.c_queue"[^>]*data-vs-depth="explanation"/);
    expect(page).toContain('<span class="vs-glossary-term" id="l-dm.c_queue" data-vs-target="c_queue" data-vs-depth="bare">Queue</span>');
    const row = /<tr>[\s\S]*?id="l-dm\.c_queue"[\s\S]*?<\/tr>/.exec(page)![0];
    expect(row).not.toContain('Read more');

    const withConceptBody = await html(doc(`{% definition id="def_only" term="queue" %}
A queue stores work.
{% /definition %}

{% domain id="dm" title="Queue" question="What is it?" %}
{% concept id="c_queue" label="Queue" definition="def_only" category="thing" %}
Its bound controls producer backpressure.
{% /concept %}
{% /domain %}`));
    const bodyRow = /<tr>[\s\S]*?id="l-dm\.c_queue"[\s\S]*?<\/tr>/.exec(withConceptBody)![0];
    expect(bodyRow).toContain('data-vs-depth="explanation"');
    expect(bodyRow).toContain('Read more');
  });

  it('the domain direction rule counts the glossary height (phase 4 review D2)', async () => {
    // The cost on a 1200 px window: beside the glossary up to 632 px (the
    // 30rem glossary basis in reader.css), else under it.
    expect(DOMAIN_BESIDE_WIDTH).toBe(632);
    expect(domainCost({ width: 876, height: 76 }, 4)).toBe(76 + 12 + 40 + 44 * 4);
    expect(domainCost({ width: 170, height: 580 }, 4)).toBe(580);
    expect(domainCost({ width: 400, height: 100 }, 4)).toBe(40 + 44 * 4);
    // A 4-concept chain: left to right is wider than 632 px, but it costs less height.
    const nodes = Array.from({ length: 4 }, (_, i) => ({ id: `c${i}`, label: `Concept ${i}` }));
    const edges = nodes.slice(1).map((n, i) => ({ id: `r${i}`, from: `c${i}`, to: n.id, label: 'relates to' }));
    const chain = await layoutGraph({ id: 'x', nodes, groups: [], edges, glossaryRows: 4 });
    const plain = await layoutGraph({ id: 'x', nodes, groups: [], edges });
    expect(chain).toEqual(plain);
    expect(chain.width).toBeGreaterThan(chain.height);
    // Two parallel chains with long labels: left to right is 1071 px wide and
    // puts the 8-row glossary under it (573); top to bottom fits beside it (562).
    const twin = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, label: `Concept ${i}` }));
    const links = twin.flatMap((n, i) => (i % 4 === 3 ? [] : [{ id: `r${i}`, from: n.id, to: `c${i + 1}`, label: 'a long relation label that wraps' }]));
    const right = await layoutGraph({ id: 'f', nodes: twin, groups: [], edges: links });
    const chosen = await layoutGraph({ id: 'f', nodes: twin, groups: [], edges: links, glossaryRows: 8 });
    expect(right.width).toBeGreaterThan(DOMAIN_BESIDE_WIDTH);
    expect(right.width).toBeLessThanOrEqual(MAX_FIGURE_WIDTH);
    expect(chosen.width).toBeLessThanOrEqual(DOMAIN_BESIDE_WIDTH);
    expect(domainCost(chosen, 8)).toBeLessThan(domainCost(right, 8));
  });

  it('the page and the example keep a compact left-to-right map (phase 4 review D2)', async () => {
    const example = await html(readFileSync(new URL('../../examples/domain-orders/index.md', import.meta.url).pathname, 'utf8'));
    const [, w, hgt] = /<figure[^>]*id="x-billing_terms"[\s\S]*?<svg [^>]*viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(example)!;
    expect(Number(w)).toBeGreaterThan(Number(hgt));
  });

  it('a `detail` inside a domain is not a concept on the map or in the glossary (phase 4 review D10)', async () => {
    const page = await html(doc(domain(`${TWO}
{% detail id="d_more" label="More" %}\nMore text.\n{% /detail %}`)));
    expect(page).not.toContain('id="v-dm.d_more"');
    expect(page).not.toContain('id="l-dm.d_more"');
    expect(page).toContain('id="x-d_more"');
  });
});

describe('terms and concepts (IMPROVEMENTS.md §5.4, §13)', () => {
  it('a definition that a concept owns names the concept; the concept shows the definition body', async () => {
    const page = await html(readFileSync(FIXTURE, 'utf8'));
    expect(page).toMatch(/<details class="vs-detail vs-kind-definition" id="x-def_order"[^>]*data-vs-concept="c_order"/);
    expect(page).not.toMatch(/id="x-def_price"[^>]*data-vs-concept="c_order"/);
    const concept = /<details class="vs-detail vs-kind-concept[^"]*" id="x-c_order"[\s\S]*?<\/details>/.exec(page)![0];
    expect(concept).toContain('<div class="vs-detail-text"><p>An order is one request from a <a class="vs-term" href="#x-def_customer"');
    expect(concept).not.toContain('data-vs-term="def_order"');
    expect(concept).toContain('data-vs-edge="r_has" data-vs-other="c_line"');
    expect(concept).toContain('data-vs-cue="thing"');
  });

  it('a definition with no concept has no data-vs-concept', async () => {
    const page = await html(doc(`${DEFS}\n<!-- vs:id p_use -->\nAn order has lines.\n`));
    expect(page).not.toContain('data-vs-concept');
  });

  it('a concept label that differs from the term is an alias of the definition', async () => {
    const text = doc(`${domain('{% concept id="c_order" label="Purchase" definition="def_order" /%}')}\n<!-- vs:id p_use -->\nEach purchase has lines.\n`);
    const page = await html(text);
    expect(page).toMatch(/id="x-p_use"[\s\S]*?<a class="vs-term" href="#x-def_order" data-vs-term="def_order">purchase<\/a>/);
    // The concept's own label in the map is a use of the term too, so hover shows the definition.
    expect(page).toMatch(/id="v-dm\.c_order"[\s\S]*?<tspan class="vs-term" data-vs-term="def_order">Purchase<\/tspan>/);
  });

  it('the concept appears where its entity appears', async () => {
    const text = doc(`${domain('{% concept id="c_order" label="Order" definition="def_order" entity="n_order" /%}')}
{% graph id="map" mode="architecture" title="Map" question="Where?" %}
I.

{% node id="n_order" label="Order record" role="concept" /%}
{% /graph %}
`);
    const page = await html(text);
    const concept = /id="x-c_order"[\s\S]*?<\/details>/.exec(page)![0];
    expect(concept).toMatch(/Appears in[\s\S]*href="#x-n_order">Order record<\/a> in <a href="#x-map">Map<\/a>/);
  });
});

describe('phase 4 review fixes (D6, D9, D14)', () => {
  it('D6: the glossary, the Terms line, and data-vs-summary hold one sentence; a cite leaves no space', async () => {
    const defs = `{% definition id="def_order" term="order" %}
An order is one request to buy products {% cite ref="src_log" /%}. It stays open until billing closes it.
{% /definition %}

{% definition id="def_line" term="invoice line" %}
An invoice line bills one product of an order.\\
It never bills two.
{% /definition %}

{% source id="src_log" kind="web" title="Billing log" url="https://example.com/log" capturedAt="2026-09-27T00:00:00Z" availability="link-only" /%}
`;
    const text = doc(`${defs}
{% domain id="dm" title="An order has lines" question="Which things does billing name?" %}
Read this once.

${TWO}
{% /domain %}
`);
    const page = await html(text);
    expect(page).toMatch(/<details class="vs-detail vs-kind-definition" id="x-def_order"[^>]*data-vs-summary="An order is one request to buy products\."/);
    expect(page).toMatch(/<details class="vs-detail vs-kind-definition" id="x-def_line"[^>]*data-vs-summary="An invoice line bills one product of an order\."/);
    const cell = /id="l-dm\.c_order"[\s\S]*?<td>([\s\S]*?)<\/td>/.exec(page)![1]!.replace(/<[^>]+>/g, '');
    expect(cell).toBe('An order is one request to buy products.');
    const projection = projectText(load(text).parsed);
    expect(projection).toContain('Order: An order is one request to buy products.\n');
  });

  it('D9: `definition` is a reference only on a concept', () => {
    const bundle = load(doc(`${domain(TWO)}
{% graph id="map" mode="architecture" title="Map" question="Where?" %}
I.

{% node id="n_order" label="Order record" role="concept" definition="done when loaded" /%}
{% /graph %}
`));
    expect(bundle.model.targets.get('c_order')!.dependencies).toContain('def_order');
    expect(bundle.model.targets.get('n_order')!.dependencies).not.toContain('done when loaded');
  });

  it('D14: a line end names only a marker that the renderer generates', () => {
    expect(() => h('path', { d: 'M0,0', 'marker-end': 'url(#m-fig.arrow)' })).not.toThrow();
    expect(() => h('path', { d: 'M0,0', 'marker-start': 'url(#m-orders_model.arrow-diamond)' })).not.toThrow();
    for (const bad of ['url(#other)', 'url(https://example.com/x.svg#m)', 'url(#m-fig.arrow) x', 'none']) {
      expect(() => h('path', { d: 'M0,0', 'marker-end': bad })).toThrow(UnsafeMarkupError);
      expect(() => h('path', { d: 'M0,0', 'marker-start': bad })).toThrow(UnsafeMarkupError);
    }
  });
});

describe('review prompts that point to a domain (IMPROVEMENTS.md §5.6, §6.2)', () => {
  const reader = (terms: string[]) => ['reader:', `  new: [${terms.join(', ')}]`];
  const uses = (terms: string[]) => terms.map((t, i) => `<!-- vs:id p_${i} -->\nThe ${t} matters. The ${t} changes.\n`).join('\n');
  const jargon = (text: string) => reviewDocument(load(text)).filter((d) => d.code === 'W_JARGON');

  it('W_JARGON suggests a domain at 3 undefined terms, not at 2, and not when a domain exists', () => {
    const three = ['alpha widget', 'beta widget', 'gamma widget'];
    const found = jargon(doc(uses(three), reader(three)));
    expect(found.map((d) => d.message).filter((m) => m.includes('`domain`'))).toEqual(['review: 3 undefined terms; consider a `domain` figure: it defines each term once, and shows how the terms relate']);
    const two = three.slice(0, 2);
    expect(jargon(doc(uses(two), reader(two))).some((d) => d.message.includes('`domain`'))).toBe(false);
    const withDomain = doc(`${uses(three)}\n${domain(TWO)}`, reader(three));
    expect(jargon(withDomain).some((d) => d.message.includes('`domain`'))).toBe(false);
  });

  it('W_VISUAL_DENSITY: a domain with fewer than 2 concepts is a definition (phase 4 review D15)', () => {
    const density = (text: string) => reviewDocument(load(text)).filter((d) => d.code === 'W_VISUAL_DENSITY' && d.targetId === 'dm');
    expect(density(doc(domain('{% concept id="c_order" label="Order" definition="def_order" /%}'))).map((d) => d.message))
      .toEqual(['review: dm shows 1 concept; a domain shows how 2 or more terms relate; for one term, use the definition alone']);
    expect(density(doc(domain(TWO)))).toEqual([]);
  });

  it('W_MERMAID names `domain` for an ER or a class diagram', () => {
    expect(nativeFor('erDiagram')).toContain('`domain`');
    expect(nativeFor('classDiagram')).toContain('`domain`');
  });
});
