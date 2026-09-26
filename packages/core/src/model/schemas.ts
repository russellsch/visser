// Compiled validators for the normative JSON Schemas in schemas/ (ARCHITECTURE.md §5.4).
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv/dist/2020.js';
import frontmatterSchema from '../../../../schemas/explain-frontmatter.schema.json' with { type: 'json' };
import packetSchema from '../../../../schemas/explain-ref-1.schema.json' with { type: 'json' };
import lockSchema from '../../../../schemas/explain-lock-1.schema.json' with { type: 'json' };
import workspaceSchema from '../../../../schemas/explain-workspace-1.schema.json' with { type: 'json' };
import manifestSchema from '../../../../schemas/explain-source-manifest-1.schema.json' with { type: 'json' };
import resolveSchema from '../../../../schemas/explain-resolve-1.schema.json' with { type: 'json' };

const ajv = new Ajv2020({ strict: true, allErrors: true });

function compile(schema: object): ValidateFunction {
  return ajv.compile(schema);
}

export const validators = {
  frontmatter: compile(frontmatterSchema),
  packet: compile(packetSchema),
  lock: compile(lockSchema),
  workspace: compile(workspaceSchema),
  sourceManifest: compile(manifestSchema),
  resolve: compile(resolveSchema),
} as const;

export type SchemaName = keyof typeof validators;

export type SchemaResult = { ok: true } | { ok: false; errors: string[] };

function describe(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? 'is invalid'}`.trim());
}

/** Validate a parsed value against one normative schema. */
export function validateAgainst(name: SchemaName, value: unknown): SchemaResult {
  const validate = validators[name];
  return validate(value) ? { ok: true } : { ok: false, errors: describe(validate.errors) };
}
