// Shared contract types (ARCHITECTURE.md §7.1, §11.3, §11.6, §15.6).
// Serialized forms are normative in schemas/*.json; these types must match them.

export type DocId = string; // lowercase UUIDv4, §6.2
export type TargetId = string; // §6.3 grammar
export type Sha256 = string; // 64 lowercase hex

export type Severity = 'error' | 'warning';

export type Diagnostic = {
  code: string; // E_* or W_* from §15.6
  severity: Severity;
  message: string;
  path?: string;
  startLine?: number;
  targetId?: TargetId;
  suggestedAction?: string;
};

export type SourceSpan = {
  path: string; // normalized POSIX path relative to document root
  startByte: number; // inclusive offset in original bytes
  endByte: number; // exclusive offset in original bytes
  startLine: number; // 1-based display hint
  endLine: number; // inclusive display hint
  fileSha256: Sha256; // raw on-disk bytes
};

export type TargetKind =
  | 'heading' | 'paragraph' | 'list' | 'table' | 'blockquote' | 'code' | 'figure' | 'hr'
  | 'source' | 'definition' | 'detail'
  | string; // catalogue tag names (graph, node, edge, trace, actor, event, annotated, annotation, ...)

export type TargetRecord = {
  id: TargetId;
  kind: TargetKind;
  label: string;
  parentId?: TargetId; // structural containment only
  sectionId?: TargetId; // nearest preceding heading at the same or higher level
  ownerComponentId?: TargetId;
  span: SourceSpan;
  bodySha256: Sha256; // sha256 of normalized original target span
  dependencies: TargetId[];
  plainText: string;
  inspectable: boolean;
};

// Output of the syntax adapter (§17.9 parseSource).
export type ParsedTarget = {
  id: TargetId;
  kind: TargetKind;
  origin: 'marker' | 'tag';
  tagName?: string; // for tag targets
  attributes: Record<string, unknown>; // tag attributes (empty for marker targets)
  parentId?: TargetId;
  startLine: number; // 1-based, inclusive
  endLine: number; // 1-based, inclusive
  startByte: number;
  endByte: number;
};

/** Source-owned math; spans use half-open offsets in the original UTF-8 bytes. */
export type MathExpression = {
  kind: 'inline' | 'display' | 'equation';
  tex: string;
  span: Pick<SourceSpan, 'path' | 'startByte' | 'endByte' | 'startLine' | 'endLine'>;
  /** The numbered target itself, only for an equation. */
  targetId?: TargetId;
  /** The smallest addressable target containing this expression, excluding its own equation target. */
  enclosingTargetId?: TargetId;
  /** Decoded rich-text attribute, when TeX came from a quoted tag value. */
  field?: string;
  /** Attribute escapes make its container span coarser than the TeX spelling. */
  spanPrecision?: 'containing-attribute';
};

export type ParsedSource = {
  path: string;
  rawBytes: Uint8Array;
  frontmatter: Record<string, unknown>;
  ast: unknown; // Markdoc AST (fences reduced to raw leaves)
  targets: ParsedTarget[]; // document order
  math?: MathExpression[]; // source order; absent for older callers
  diagnostics: Diagnostic[];
};
