/** Authored emphasis is presentation metadata, never inspection content. */
export const EMPHASIS_TONES = ['teal', 'violet', 'amber'] as const;
export type EmphasisTone = typeof EMPHASIS_TONES[number];
export const EMPHASIS_TAGS = ['node', 'edge', 'state', 'transition', 'factor', 'causal-link', 'task', 'dependency', 'stage', 'conversion', 'concept', 'relation'] as const;
export function emphasisTone(value: unknown): EmphasisTone | undefined {
  return typeof value === 'string' && (EMPHASIS_TONES as readonly string[]).includes(value) ? value as EmphasisTone : undefined;
}

export function nativeEmphasis(kind: string | undefined, value: unknown): EmphasisTone | undefined {
  return kind && (EMPHASIS_TAGS as readonly string[]).includes(kind) ? emphasisTone(value) : undefined;
}
