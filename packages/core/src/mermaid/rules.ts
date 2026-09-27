// Build-time checks on Mermaid source (ARCHITECTURE.md §9.12): rejected
// content, size limit, diagram classification, and the name-to-ID mapping.
import type { MermaidDiagramType } from './types.ts';

export type MermaidIssue = { code: string; message: string; line?: number };

/** §9.12 source limit. */
export const MERMAID_SOURCE_LIMIT = 64 * 1024;

const TARGET_ID = /^[a-z][a-z0-9_-]{0,63}$/;

// classDef/style/linkStyle declarations that cannot move, hide, or resize content.
const STYLE_PROPERTIES = new Set(['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'color', 'font-weight', 'font-style']);
// Literal values only: hex or named colours, numbers, px lengths, and number lists (dash arrays).
const STYLE_VALUE = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|-?\d+(\.\d+)?(px)?(\s+-?\d+(\.\d+)?(px)?)*)$/;

/** Normalize a fenced body: strip one BOM and use LF line endings. */
export function normalizeMermaidSource(source: string): string {
  return source.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
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
  if (declaredType === 'flowchart' || declaredType === 'graph') return 'flowchart';
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
    } else if (!STYLE_VALUE.test(value)) {
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

  // Frontmatter configuration: the first non-blank line is `---`.
  const first = lines.findIndex((l) => l.trim() !== '');
  if (first !== -1 && /^\s*-{3,}\s*$/.test(lines[first]!)) {
    issues.push({ code: 'E_UNSAFE_CONTENT', message: 'frontmatter configuration (`---`) is not allowed in Mermaid source; the toolkit sets the configuration', line: first + 1 });
  }

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    // Directives take effect anywhere, including after the header and indented.
    if (/%%\s*\{/.test(line)) {
      issues.push({ code: 'E_UNSAFE_CONTENT', message: '`%%{…}%%` directives are not allowed; the toolkit sets the configuration', line: lineNo });
    }
    const statement = withoutQuotes(line);
    // Interaction and link statements: `click`, `href`, `call`, `callback`, and
    // the `link`/`links` statements of class and sequence diagrams. A node that
    // happens to use one of these names is still allowed when an arrow follows.
    const keyword = /^\s*(click|href|call|callback|link|links)\b(\s+(?![-=.~<>|&o*x])\S)/i.exec(statement);
    if (keyword) {
      issues.push({ code: 'E_UNSAFE_CONTENT', message: `\`${keyword[1]}\` statements are not allowed in Mermaid source (they create links or callbacks)`, line: lineNo });
    }
    // HTML tags in labels, except <br>; `<<…>>` stereotypes are not tags.
    const withoutStereotypes = line.replace(/<<[^<>]*>>/g, '');
    for (const tag of withoutStereotypes.matchAll(/<\/?[A-Za-z][^>]*>?/g)) {
      if (!/^<br\s*\/?>$/i.test(tag[0])) {
        issues.push({ code: 'E_UNSAFE_CONTENT', message: `HTML \`${tag[0].slice(0, 40)}\` is not allowed in Mermaid labels (only <br> is); write &lt; for a literal <`, line: lineNo });
      }
    }
    checkStyleLine(line, lineNo, issues);
  });

  // Node shapes with images or icons fetch or embed external content.
  for (const shape of text.matchAll(/@\{[^}]*\}/gs)) {
    const kind = /\b(img|icon)\s*:/.exec(shape[0]);
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
  const cleaned = text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/^`([\s\S]*)`$/, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned === '' ? fallback : cleaned;
}
