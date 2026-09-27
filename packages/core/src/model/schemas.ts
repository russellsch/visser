// Compiled validators for the normative JSON Schemas in schemas/ (ARCHITECTURE.md §5.4).
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv/dist/2020.js';
import frontmatterSchema from '../../../../schemas/visser-frontmatter.schema.json' with { type: 'json' };
import packetSchema from '../../../../schemas/visser-ref-1.schema.json' with { type: 'json' };
import lockSchema from '../../../../schemas/visser-lock-1.schema.json' with { type: 'json' };
import workspaceSchema from '../../../../schemas/visser-workspace-1.schema.json' with { type: 'json' };
import manifestSchema from '../../../../schemas/visser-source-manifest-1.schema.json' with { type: 'json' };
import resolveSchema from '../../../../schemas/visser-resolve-1.schema.json' with { type: 'json' };
import editSchema from '../../../../schemas/visser-edit-1.schema.json' with { type: 'json' };
import diagnosticsSchema from '../../../../schemas/visser-diagnostics-1.schema.json' with { type: 'json' };
import checkSchema from '../../../../schemas/visser-check-1.schema.json' with { type: 'json' };
import captureSchema from '../../../../schemas/visser-capture-1.schema.json' with { type: 'json' };
import forkSchema from '../../../../schemas/visser-fork-1.schema.json' with { type: 'json' };
import showSchema from '../../../../schemas/visser-show-1.schema.json' with { type: 'json' };
import refreshSchema from '../../../../schemas/visser-refresh-1.schema.json' with { type: 'json' };
import buildSchema from '../../../../schemas/visser-build-1.schema.json' with { type: 'json' };
import releaseSchema from '../../../../schemas/visser-release-1.schema.json' with { type: 'json' };
import trustStoreSchema from '../../../../schemas/visser-trust-store-1.schema.json' with { type: 'json' };
import doctorSchema from '../../../../schemas/visser-doctor-1.schema.json' with { type: 'json' };
import skillSchema from '../../../../schemas/visser-skill-1.schema.json' with { type: 'json' };
import installSchema from '../../../../schemas/visser-install-1.schema.json' with { type: 'json' };
import trustSchema from '../../../../schemas/visser-trust-1.schema.json' with { type: 'json' };
import exportSchema from '../../../../schemas/visser-export-1.schema.json' with { type: 'json' };
import collectionSchema from '../../../../schemas/visser-collection-1.schema.json' with { type: 'json' };
import upgradeSchema from '../../../../schemas/visser-upgrade-1.schema.json' with { type: 'json' };
import extensionSchema from '../../../../schemas/visser-extension-1.schema.json' with { type: 'json' };
import componentOutputSchema from '../../../../schemas/visser-component-output-1.schema.json' with { type: 'json' };
import extensionInspectSchema from '../../../../schemas/visser-extension-inspect-1.schema.json' with { type: 'json' };
import extensionTrustSchema from '../../../../schemas/visser-extension-trust-1.schema.json' with { type: 'json' };
import extensionInstallSchema from '../../../../schemas/visser-extension-install-1.schema.json' with { type: 'json' };
import extensionPinSchema from '../../../../schemas/visser-extension-pin-1.schema.json' with { type: 'json' };
import catalogueSchema from '../../../../schemas/visser-catalogue-1.schema.json' with { type: 'json' };

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
  doctor: compile(doctorSchema),
  skill: compile(skillSchema),
  install: compile(installSchema),
  trust: compile(trustSchema),
  export: compile(exportSchema),
  collection: compile(collectionSchema),
  upgrade: compile(upgradeSchema),
  extension: compile(extensionSchema),
  componentOutput: compile(componentOutputSchema),
  extensionInspect: compile(extensionInspectSchema),
  extensionTrust: compile(extensionTrustSchema),
  extensionInstall: compile(extensionInstallSchema),
  extensionPin: compile(extensionPinSchema),
  catalogue: compile(catalogueSchema),
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
