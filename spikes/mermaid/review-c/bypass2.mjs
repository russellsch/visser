import { runCases } from './harness.mjs';
const E = 'https://evil.example/';
const cases = {
  shape_brace_in_label: `flowchart TD\n  A@{ label: "}", img: "${E}i.png", h: 60, constraint: "on" }`,
  shape_quoted_key: `flowchart TD\n  A@{ "img": "${E}i.png", label: "x", h: 60, constraint: "on" }`,
  shape_label_img: `flowchart TD\n  A@{ shape: rect, label: "<img src='${E}i.png'>" }`,
  class_link: `classDiagram\n  class Queue\n  link Queue "${E}"`,
  class_click_href: `classDiagram\n  class Queue\n  click Queue href "${E}"`,
  class_click_x: `classDiagram\n  class Xq\n  click Xq href "${E}"`,
  seq_link_semicolon: `sequenceDiagram\n  participant A; link A: Dash @ ${E}`,
  seq_links_json: `sequenceDiagram\n  participant A\n  links A: {"Dash": "${E}"}`,
  seq_box_url: `sequenceDiagram\n  box url(${E}b.png) Group\n  participant A\n  end\n  A->>A: hi`,
  seq_rect_url: `sequenceDiagram\n  participant A\n  rect url(${E}r.png)\n  A->>A: hi\n  end`,
  style_transparent: `flowchart LR\n  a[Secret caveat] --> b\n  style a fill:none,stroke:none,color:transparent`,
  style_escape_url: `flowchart LR\n  a --> b\n  style a fill:\\75rl(${E}x.png)`,
  classdef_semicolon: `flowchart LR\n  a:::c --> b\n  classDef c fill:#f00;stroke:#000`,
  fm_after_comment: `%% note\n---\nconfig:\n  theme: forest\n---\nflowchart LR\n  a --> b`,
  directive_entity: `flowchart LR\n  %%#123;init: {'theme':'forest'}#125;%%\n  a --> b`,
  state_note_tag: `stateDiagram-v2\n  A --> B\n  note right of A : <a href='${E}'>x</a>`,
};
console.log(JSON.stringify(await runCases(cases), null, 1));
