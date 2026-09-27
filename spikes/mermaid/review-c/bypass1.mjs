import { runCases } from './harness.mjs';
const E = 'https://evil.example/';
const cases = {
  base_link: `flowchart LR\n  a["<a href='${E}'>x</a>"] --> b`,
  stereo_anchor: `flowchart LR\n  a["<<a href='${E}'>>click me"] --> b`,
  stereo_img: `flowchart LR\n  a["<<img src='${E}t.png'>>"] --> b`,
  entity_hash_lt: `flowchart LR\n  a["#lt;a href='${E}'#gt;link#lt;/a#gt;"] --> b`,
  entity_numeric: `flowchart LR\n  a["#60;a href='${E}'#62;link#60;/a#62;"] --> b`,
  entity_html_lt: `flowchart LR\n  a["&lt;a href='${E}'&gt;link&lt;/a&gt;"] --> b`,
  md_link: 'flowchart LR\n  a["`[x](' + E + ')`"] --> b',
  md_img: 'flowchart LR\n  a["`![x](' + E + 'i.png)`"] --> b',
  click_x_node: `flowchart LR\n  xnode --> b\n  click xnode href "${E}"`,
  click_o_node: `flowchart LR\n  onode --> b\n  click onode href "${E}"`,
  click_semicolon: `flowchart LR\n  a --> b; click a href "${E}"`,
  click_in_subgraph_line: `flowchart LR\n  subgraph s; a --> b; click a href "${E}"; end`,
  katex_href: 'flowchart LR\n  a["$$\\href{' + E + '}{x}$$"] --> b',
  br_attr: `flowchart LR\n  a["x<br onmouseover=alert(1)>y"] --> b`,
  unquoted_label_tag: `flowchart LR\n  a[x <b>bold</b>] --> b`,
};
console.log(JSON.stringify(await runCases(cases), null, 1));
