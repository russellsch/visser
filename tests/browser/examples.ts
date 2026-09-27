// Example bundles served for browser tests: one `explain serve` process each.
export const EXAMPLE_PORTS = {
  'bounded-queue': 4311,
  'connection-lifecycle': 4321,
  'image-pipeline': 4322,
  'cache-stampede': 4323,
  'queue-designs': 4324,
  'schema-migration': 4325,
  'order-intake': 4326,
  'deadline-retry': 4327,
  'mermaid-flowchart': 4328,
  'mermaid-state': 4329,
  'mermaid-sequence': 4330,
  'mermaid-er': 4331,
} as const;

export type ExampleName = keyof typeof EXAMPLE_PORTS;
export const EXAMPLES = Object.keys(EXAMPLE_PORTS) as ExampleName[];

/** Examples with a Mermaid figure (§9.12). */
export const MERMAID_EXAMPLES = ['mermaid-flowchart', 'mermaid-state', 'mermaid-sequence', 'mermaid-er'] as const satisfies readonly ExampleName[];
