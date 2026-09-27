// Review bypasses of the §9.12 rejection rules (spikes/mermaid/review-c). Each
// rejected case produced a link or an off-origin request in Mermaid 12.0.0
// under securityLevel 'strict' while the earlier rules accepted it.
import { describe, expect, it } from 'vitest';
import { checkMermaidSource, cleanLabel, declaredTypeOf, diagramTypeOf } from '../../packages/core/src/mermaid/rules.ts';

const E = 'https://evil.example/';
const codes = (src: string) => checkMermaidSource(src).map((i) => i.code);

describe('Mermaid rule bypasses found in review (§9.12) @R11', () => {
  const rejected: Record<string, string> = {
    stereo_anchor: `flowchart LR\n  a["<<a href='${E}'>>click me"] --> b`,
    stereo_img: `flowchart LR\n  a["<<img src='${E}t.png'>>"] --> b`,
    click_x_node: `flowchart LR\n  xnode --> b\n  click xnode href "${E}"`,
    click_o_node: `flowchart LR\n  onode --> b\n  click onode href "${E}"`,
    click_star_node: `flowchart LR\n  n --> b\n  click *n href "${E}"`,
    class_click_x: `classDiagram\n  class Xq\n  click Xq href "${E}"`,
    click_semicolon: `flowchart LR\n  a --> b; click a href "${E}"`,
    click_in_subgraph_line: `flowchart LR\n  subgraph s; a --> b; click a href "${E}"; end`,
    seq_link_semicolon: `sequenceDiagram\n  participant A; link A: Dash @ ${E}`,
    shape_brace_in_label: `flowchart TD\n  A@{ label: "}", img: "${E}i.png", h: 60, constraint: "on" }`,
    shape_quoted_key: `flowchart TD\n  A@{ "img": "${E}i.png", label: "x", h: 60, constraint: "on" }`,
    shape_single_quoted_icon: `flowchart TD\n  A@{ 'icon': "fa:user", label: "x" }`,
    seq_rect_url: `sequenceDiagram\n  participant A\n  rect url(${E}r.png)\n  A->>A: hi\n  end`,
    seq_box_url: `sequenceDiagram\n  box url(${E}b.png) Group\n  participant A\n  end\n  A->>A: hi`,
    style_transparent: `flowchart LR\n  a[Secret caveat] --> b\n  style a fill:none,stroke:none,color:transparent`,
    style_alpha_hex8: `flowchart LR\n  a --> b\n  style a color:#00000000`,
    style_alpha_hex4: `flowchart LR\n  a --> b\n  classDef c fill:#0000`,
    style_color_none: `flowchart LR\n  a --> b\n  style a color:none`,
  };
  for (const [name, src] of Object.entries(rejected)) {
    it(`rejects ${name} with E_UNSAFE_CONTENT`, () => {
      expect(codes(src)).toContain('E_UNSAFE_CONTENT');
    });
  }

  const allowed: Record<string, string> = {
    choice_stereotype: 'stateDiagram-v2\n  state pick <<choice>>\n  [*] --> pick',
    fork_join: 'stateDiagram-v2\n  state split <<fork>>\n  state merge <<join>>\n  [*] --> split\n  split --> merge',
    interface_stereotype: 'classDiagram\n  class WorkQueue {\n    <<interface>>\n  }',
    node_named_click_with_arrow: 'flowchart LR\n  click --> b',
    node_named_link_with_arrow: 'flowchart LR\n  link --> b',
    br_label: 'flowchart LR\n  a["one<br>two"] --> b',
    semicolon_statements: 'flowchart LR\n  a --> b; b --> c',
    quoted_semicolon: 'flowchart LR\n  a["x; click a href y"] --> b',
    fill_hex6: 'flowchart LR\n  a --> b\n  classDef c fill:#ffcc00,stroke:#333,color:#000',
    fill_none: 'flowchart LR\n  a --> b\n  style a fill:none',
    rect_rgb: 'sequenceDiagram\n  participant A\n  rect rgb(200, 220, 255)\n  A->>A: hi\n  end',
    rect_rgba: 'sequenceDiagram\n  participant A\n  rect rgba(0, 0, 255, .1)\n  A->>A: hi\n  end',
    box_named: 'sequenceDiagram\n  box Aqua Group\n  participant A\n  end\n  A->>A: hi',
    shape_quoted_label: 'flowchart TD\n  A@{ shape: rect, label: "a } b" }',
  };
  for (const [name, src] of Object.entries(allowed)) {
    it(`allows ${name}`, () => {
      expect(checkMermaidSource(src)).toEqual([]);
    });
  }

  it('rejects Mermaid entity codes with E_SEMANTIC (the renderer garbles them)', () => {
    expect(codes('flowchart LR\n  a["#quot;quoted#quot;"] --> b')).toContain('E_SEMANTIC');
    expect(codes('flowchart LR\n  a["#35; number"] --> b')).toContain('E_SEMANTIC');
    expect(codes('flowchart LR\n  %%#123;init: {}#125;%%\n  a --> b')).toContain('E_SEMANTIC');
    expect(codes('flowchart LR\n  a["issue #12 is open"] --> b')).toEqual([]);
  });

  it('parses flowchart-elk as a flowchart', () => {
    expect(declaredTypeOf('flowchart-elk LR\n  a --> b')).toBe('flowchart-elk');
    expect(diagramTypeOf('flowchart-elk')).toBe('flowchart');
  });

  it('removes markdown emphasis so build labels match rendered labels', () => {
    expect(cleanLabel('`**Edge** cache`', 'x')).toBe('Edge cache');
    expect(cleanLabel('`_slow_ path`', 'x')).toBe('slow path');
    expect(cleanLabel('snake_case_name', 'x')).toBe('snake_case_name');
  });
});
