// Compiled validators for the normative JSON Schemas in schemas/ (ARCHITECTURE.md §5.4).
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv/dist/2020.js';
import frontmatterSchema from '../../../../schemas/explain-frontmatter.schema.json' with { type: 'json' };
import packetSchema from '../../../../schemas/explain-ref-1.schema.json' with { type: 'json' };
import lockSchema from '../../../../schemas/explain-lock-1.schema.json' with { type: 'json' };
import workspaceSchema from '../../../../schemas/explain-workspace-1.schema.json' with { type: 'json' };
import manifestSchema from '../../../../schemas/explain-source-manifest-1.schema.json' with { type: 'json' };
import resolveSchema from '../../../../schemas/explain-resolve-1.schema.json' with { type: 'json' };
import editSchema from '../../../../schemas/explain-edit-1.schema.json' with { type: 'json' };
import diagnosticsSchema from '../../../../schemas/explain-diagnostics-1.schema.json' with { type: 'json' };
import checkSchema from '../../../../schemas/explain-check-1.schema.json' with { type: 'json' };
import captureSchema from '../../../../schemas/explain-capture-1.schema.json' with { type: 'json' };
import forkSchema from '../../../../schemas/explain-fork-1.schema.json' with { type: 'json' };
import showSchema from '../../../../schemas/explain-show-1.schema.json' with { type: 'json' };
import refreshSchema from '../../../../schemas/explain-refresh-1.schema.json' with { type: 'json' };
import buildSchema from '../../../../schemas/explain-build-1.schema.json' with { type: 'json' };
import releaseSchema from '../../../../schemas/explain-release-1.schema.json' with { type: 'json' };
import trustStoreSchema from '../../../../schemas/explain-trust-store-1.schema.json' with { type: 'json' };

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
  edit: compile(editSchema),
  // Every --json output and every generated metadata file has a schema (§5.4).
  // Order matters: these reference the packet and resolve schemas by $id.
  diagnostics: compile(diagnosticsSchema),
  check: compile(checkSchema),
  capture: compile(captureSchema),
  fork: compile(forkSchema),
  show: compile(showSchema),
  refresh: compile(refreshSchema),
  build: compile(buildSchema),
  release: compile(releaseSchema),
  trustStore: compile(trustStoreSchema),
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
