// Build-time checks on Mermaid source (ARCHITECTURE.md §9.12): rejected
// content, size limit, diagram classification, and the name-to-ID mapping.
import type { MermaidDiagramType } from './types.ts';

export type MermaidIssue = { code: string; message: string; line?: number; startByte?: number; endByte?: number };

/** §9.12 source limit. */
export const MERMAID_SOURCE_LIMIT = 64 * 1024;

const TARGET_ID = /^[a-z][a-z0-9_-]{0,63}$/;

// classDef/style/linkStyle declarations that cannot move, hide, or resize content.
const STYLE_PROPERTIES = new Set(['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'color', 'font-weight', 'font-style']);
// Literal values only: opaque hex (3 or 6 digits) or named colours, numbers, px
// lengths, and number lists (dash arrays). Alpha hex (4 or 8 digits) and
// `transparent` are rejected because they can hide content (review-c).
const STYLE_VALUE = /^(#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|[a-zA-Z]+|-?\d+(\.\d+)?(px)?(\s+-?\d+(\.\d+)?(px)?)*)$/;
// Colours for sequence `rect` and `box`: rgb()/rgba(), opaque hex, or a name.
const BLOCK_COLOUR = /^(rgba?\(\s*[\d.%]+\s*(,\s*[\d.%]+\s*){2,3}\)|#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|[a-zA-Z]+)$/;
// Real stereotypes only (`<<choice>>`, `<<interface>>`); `<<a href=…>>` is a tag.
const STEREOTYPE = /<<[A-Za-z0-9_ -]+>>/g;
// Mermaid entity codes (`#quot;`, `#35;`) are garbled by the renderer.
// Match the pinned renderer's complete encodeEntities token grammar.
const ENTITY_CODE = /#\w+;/;

/** Normalize a fenced body: strip one BOM and use LF line endings. */
export function normalizeMermaidSource(source: string): string {
  return source.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

// A whole-line Mermaid comment: `%%` after optional indentation. Mermaid's own
// preprocessor removes these lines for every diagram type before parsing
// (cleanupComments in mermaid 12), so they never change the rendering.
const COMMENT_LINE = /^[ \t]*%%/;

/**
 * Remove whole-line `%%` comments from Mermaid source before it is shown or
 * embedded (§13.5 export contract). Comments do not affect rendering, but they
 * can hold private notes such as internal hostnames. The document source and
 * every identity hash are unchanged: only generated output is filtered.
 * Directive lines (`%%{`) are rejected earlier by checkMermaidSource.
 */
export function stripMermaidComments(source: string): string {
  return normalizeMermaidSource(source).split('\n').filter((line) => !COMMENT_LINE.test(line)).join('\n');
}

/** The first keyword of the diagram, e.g. `flowchart`, `stateDiagram-v2`, `erDiagram`. */
export function declaredTypeOf(source: string): string {
  for (const raw of normalizeMermaidSource(source).split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('%%')) continue;
    return line.split(/\s+/)[0] ?? '';
  }
  return '';
}

export function diagramTypeOf(declaredType: string): MermaidDiagramType {
  if (declaredType === 'flowchart' || declaredType === 'graph' || declaredType === 'flowchart-elk' || declaredType === 'swimlane-beta') return 'flowchart';
  if (declaredType === 'stateDiagram' || declaredType === 'stateDiagram-v2') return 'state';
  if (declaredType === 'sequenceDiagram') return 'sequence';
  return 'other';
}

/**
 * Map a Mermaid name to a target ID (§9.12): ASCII letters to lowercase and
 * `.` to `_`. Returns undefined when the result does not match the §6.3 grammar.
 */
export function mapMermaidName(name: string): string | undefined {
  const mapped = name.replace(/[A-Z]/g, (c) => c.toLowerCase()).replace(/\./g, '_');
  return TARGET_ID.test(mapped) ? mapped : undefined;
}

/** Remove quoted strings so keyword checks only see statement text. */
function withoutQuotes(line: string): string {
  return line.replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

/** Split a line into statements at every `;` outside double or single quotes. */
export function splitStatements(line: string): string[] {
  const out: string[] = [];
  let quote: string | undefined;
  let start = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = undefined;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === ';') {
      out.push(line.slice(start, i));
      start = i + 1;
    }
  }
  out.push(line.slice(start));
  return out;
}

/** Each `@{ … }` shape block, ended by a quote-aware scan (a `}` inside quotes does not end it). */
function shapeBlocks(text: string): Array<{ body: string; index: number }> {
  const blocks: Array<{ body: string; index: number }> = [];
  for (let at = text.indexOf('@{'); at !== -1; at = text.indexOf('@{', at + 2)) {
    let quote: string | undefined;
    let depth = 0;
    let end = text.length;
    for (let i = at + 1; i < text.length; i++) {
      const c = text[i]!;
      if (quote) {
        if (c === '\\') i++;
        else if (c === quote) quote = undefined;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        end = i + 1;
        break;
      }
    }
    blocks.push({ body: text.slice(at, end), index: at });
  }
  return blocks;
}

function checkStyleLine(line: string, lineNo: number, issues: MermaidIssue[]): void {
  const m = /^\s*(classDef|style|linkStyle)\s+(\S+)\s*(.*)$/.exec(line);
  if (!m) return;
  let declarations = m[3]!.trim();
  if (m[1] === 'linkStyle') declarations = declarations.replace(/^interpolate\s+\w+\s*/, '');
  for (const part of declarations.split(/[,;]/)) {
    const decl = part.trim();
    if (decl === '') continue;
    const colon = decl.indexOf(':');
    const property = (colon === -1 ? decl : decl.slice(0, colon)).trim().toLowerCase();
    const value = colon === -1 ? '' : decl.slice(colon + 1).trim();
    if (!STYLE_PROPERTIES.has(property)) {
      issues.push({ code: 'E_UNSAFE_CONTENT', message: `${m[1]} declaration \`${property}\` is not allowed; use fill, stroke, stroke-width, stroke-dasharray, color, font-weight, or font-style`, line: lineNo });
    } else if (!STYLE_VALUE.test(value) || /^transparent$/i.test(value) || (property === 'color' && /^none$/i.test(value))) {
      issues.push({ code: 'E_UNSAFE_CONTENT', message: `${m[1]} value \`${value}\` for \`${property}\` must be a literal colour, number, or px length`, line: lineNo });
    }
  }
}

/** §9.12 rejected content and the source size limit. Lines are 1-based within the fence body. */
export function checkMermaidSource(source: string): MermaidIssue[] {
  const issues: MermaidIssue[] = [];
  const text = normalizeMermaidSource(source);
  if (new TextEncoder().encode(text).length > MERMAID_SOURCE_LIMIT) {
    issues.push({ code: 'E_LIMIT', message: `Mermaid source is larger than ${MERMAID_SOURCE_LIMIT} bytes` });
    return issues;
  }
  const lines = text.split('\n');
  const family = declaredTypeOf(text) || 'unknown';

  // Frontmatter configuration: the first non-blank line is `---`.
  const first = lines.findIndex((l) => l.trim() !== '');
  if (first !== -1 && /^\s*-{3,}\s*$/.test(lines[first]!)) {
    issues.push({ code: 'E_UNSAFE_CONTENT', message: 'frontmatter configuration (`---`) is not allowed in Mermaid source; the toolkit sets the configuration', line: first + 1 });
  }

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    // Pie math has a grammar-scoped extractor in the isolated parse worker.
    // Other families retain the conservative guard until similarly covered.
    if (family !== 'erDiagram' && family !== 'info' && family !== 'kanban' && family !== 'requirementDiagram' && family !== 'radar-beta' && family !== 'radar-beta:' && family !== 'sankey' && family !== 'sankey-beta' && family !== 'xychart' && family !== 'xychart-beta' && family !== 'quadrantChart' && family !== 'journey' && family !== 'pie' && family !== 'timeline' && family !== 'flowchart' && family !== 'graph' && family !== 'flowchart-elk' && family !== 'swimlane-beta' && family !== 'sequenceDiagram' && family !== 'stateDiagram' && family !== 'stateDiagram-v2' && !COMMENT_LINE.test(line) && line.includes('$$')) {
      issues.push({ code: 'E_MATH', message: `Mermaid ${family} math adapter is not implemented; $$ labels cannot be exported yet`, line: lineNo });
    }
    // Directives take effect anywhere, including after the header and indented.
    if (/%%\s*\{/.test(line)) {
      issues.push({ code: 'E_UNSAFE_CONTENT', message: '`%%{…}%%` directives are not allowed; the toolkit sets the configuration', line: lineNo });
    }
    const entity = ENTITY_CODE.exec(line);
    if (entity) {
      issues.push({ code: 'E_SEMANTIC', message: `Mermaid entity code \`${entity[0]}\` is garbled by the renderer; write the character directly`, line: lineNo });
    }
    const unquoted = withoutQuotes(line);
    // `%%` inside a line has no single meaning: the state lexer skips it as a
    // comment, flowchart rejects it, and sequence keeps it as message text. A
    // skipped tail would stay visible in generated output, so only whole-line
    // comments are allowed (they are removed from output).
    if (!COMMENT_LINE.test(line) && unquoted.includes('%%')) {
      issues.push({ code: 'E_UNSAFE_CONTENT', message: '`%%` is allowed only at the start of a line (a whole-line comment); inside a line its meaning differs by diagram type', line: lineNo });
    }
    if (/url\s*\(/i.test(unquoted)) {
      issues.push({ code: 'E_UNSAFE_CONTENT', message: '`url(…)` is not allowed in Mermaid source; it fetches off-origin content', line: lineNo });
    }
    // Mermaid accepts `;` as a statement separator, so check each statement.
    for (const statement of splitStatements(unquoted)) {
      // Interaction and link statements: `click`, `href`, `call`, `callback`, and
      // the `link`/`links` statements of class and sequence diagrams. A node that
      // happens to use one of these names is still allowed when an arrow follows.
      const keyword = /^\s*(click|href|call|callback|link|links)\b(\s+(?![-=.~<>&|])\S)/i.exec(statement);
      if (keyword) {
        issues.push({ code: 'E_UNSAFE_CONTENT', message: `\`${keyword[1]}\` statements are not allowed in Mermaid source (they create links or callbacks)`, line: lineNo });
      }
      // Sequence `rect` and `box` colours.
      const block = /^\s*(rect|box)\s+(.*)$/.exec(statement);
      if (block) {
        const value = block[2]!.trim();
        const colour = block[1] === 'rect' ? value : (/^(rgba?\([^)]*\)|\S+)/.exec(value)?.[0] ?? '');
        const isFunction = /^[A-Za-z-]+\s*\(/.test(colour);
        if ((block[1] === 'rect' || isFunction) && !BLOCK_COLOUR.test(colour)) {
          issues.push({ code: 'E_UNSAFE_CONTENT', message: `\`${block[1]}\` colour \`${colour.slice(0, 40)}\` must be rgb(), rgba(), an opaque hex colour, or a name`, line: lineNo });
        }
      }
      checkStyleLine(statement, lineNo, issues);
    }
    // HTML tags in labels, except <br>; real `<<stereotypes>>` are not tags.
    const withoutStereotypes = line.replace(STEREOTYPE, '');
    for (const tag of withoutStereotypes.matchAll(/<\/?[A-Za-z][^>]*>?/g)) {
      if (!/^<br\s*\/?>$/i.test(tag[0])) {
        issues.push({ code: 'E_UNSAFE_CONTENT', message: `HTML \`${tag[0].slice(0, 40)}\` is not allowed in Mermaid labels (only <br> is); write &lt; for a literal <`, line: lineNo });
      }
    }
  });

  // Node shapes with images or icons fetch or embed external content. The end
  // of each block is found with a quote-aware scan, and keys may be quoted.
  for (const shape of shapeBlocks(text)) {
    const kind = /(?:^|[{,\s])["']?(img|icon)["']?\s*:/.exec(shape.body);
    if (kind) {
      const lineNo = text.slice(0, shape.index).split('\n').length;
      issues.push({ code: 'E_UNSAFE_CONTENT', message: `the \`${kind[1]}:\` node-shape attribute is not allowed`, line: lineNo });
    }
  }
  return issues;
}

/** Plain label text: `<br>` becomes a space, markdown-string backticks are removed. */
export function cleanLabel(text: unknown, fallback: string): string {
  if (typeof text !== 'string') return fallback;
  // A markdown string (`\`…\``) renders its emphasis, so drop the markers.
  const markdown = /^`([\s\S]*)`$/.exec(text);
  const body = markdown ? markdown[1]!.replace(/(\*\*|__)(.+?)\1/g, '$2').replace(/(\*|_)(.+?)\1/g, '$2') : text;
  const cleaned = body
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned === '' ? fallback : cleaned;
}
