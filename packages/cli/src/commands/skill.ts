// `visser skill show [--doc PATH] [--toolkit-dir DIR | --dev-toolkit DIR] [--json]` (§12.7, §17.1).
// Prints the core skill pinned by the document's lock, and absolute local
// paths to the guides in that toolkit's skills/visser-visual-explain/references/. With no
// document it uses the workspace default, then the user default, then the
// release that contains the running CLI. `--dev-toolkit DIR` wins over all of
// these, as it does for `check` and `build`. Read-only.
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { CliError, EXIT, type ParsedArgs, printJson, stringFlag } from '../cli-util.ts';
import { bundledReleaseDir, findRepositoryRoot, readDefaultPointer, readLock, resolveDigest, verifyRelease, workspaceDefault, type ResolutionSource, type VerifiedRelease } from '../toolkit.ts';

export type SkillOptions = { env?: NodeJS.ProcessEnv; cwd?: string; ownRelease?: string | undefined };

const USAGE = 'usage: visser skill show [--doc PATH] [--toolkit-dir DIR | --dev-toolkit DIR] [--json]';

export type SkillSelection = { release: VerifiedRelease; source: ResolutionSource | 'dev-toolkit'; document?: string };

/**
 * The toolkit whose skill text and guides `skill show` and `catalogue` print.
 * An explicit `--dev-toolkit DIR` wins over a lock and every default, as in
 * resolveForDocument: the shim already runs that toolkit's CLI, so the text
 * must come from the same toolkit (skill-prompts-review-1, F1). These
 * commands only read text, so no digest check against the running CLI applies.
 */
export function selectForSkill(args: ParsedArgs, opts: SkillOptions): SkillSelection {
  const env = opts.env ?? process.env;
  const cwd = opts.cwd ?? process.cwd();
  const own = 'ownRelease' in opts ? opts.ownRelease : bundledReleaseDir();
  const toolkitDir = stringFlag(args, 'toolkit-dir');
  const devToolkit = stringFlag(args, 'dev-toolkit');
  const doc = stringFlag(args, 'doc');
  if (doc) {
    const path = resolve(cwd, doc);
    if (!existsSync(path)) throw new CliError('E_SOURCE_UNAVAILABLE', `cannot read ${doc}`, EXIT.unavailable);
    if (devToolkit) return { release: verifyRelease(resolve(cwd, devToolkit)), source: 'dev-toolkit', document: path };
    const bundleRoot = lstatSync(path).isDirectory() ? path : dirname(path);
    const lock = readLock(bundleRoot);
    if (!lock) throw new CliError('E_TOOLKIT_MISSING', `no visser.lock.json in ${bundleRoot}; restore visser.lock.json from version control, or pass --toolkit-dir DIR (\`visser init\` is only for a new document)`, EXIT.unavailable);
    const found = resolveDigest({ digest: lock.sha256, repoRoot: findRepositoryRoot(bundleRoot), toolkitDir, ownRelease: own, env, origin: lock.origin, version: lock.version });
    return { ...found, document: path };
  }
  if (devToolkit) return { release: verifyRelease(resolve(cwd, devToolkit)), source: 'dev-toolkit' };
  if (toolkitDir) return { release: verifyRelease(resolve(cwd, toolkitDir)), source: 'toolkit-dir' };
  const repoRoot = findRepositoryRoot(cwd);
  const digest = workspaceDefault(repoRoot) ?? readDefaultPointer(env);
  if (digest) return resolveDigest({ digest, repoRoot, ownRelease: own, env });
  if (own) return { release: verifyRelease(own), source: 'running' };
  throw new CliError('E_TOOLKIT_MISSING', 'no document, workspace default, or user default toolkit; pass --doc PATH, --toolkit-dir DIR, or --dev-toolkit DIR', EXIT.unavailable);
}

export async function runSkill(args: ParsedArgs, opts: SkillOptions = {}): Promise<number> {
  if (args.positional[0] !== 'show' || args.positional.length !== 1) throw new CliError('E_USAGE', USAGE, EXIT.invalid);
  const found = selectForSkill(args, opts);
  const dir = found.release.dir;
  const skillPath = join(dir, 'skills', 'visser-visual-explain', 'SKILL.md');
  if (!existsSync(skillPath)) throw new CliError('E_TOOLKIT_MISSING', `toolkit ${found.release.sha256} has no skills/visser-visual-explain/SKILL.md`, EXIT.unavailable);
  const text = readFileSync(skillPath, 'utf8');
  const referenceDir = join(dir, 'skills', 'visser-visual-explain', 'references');
  // references/*.md, then the catalogue guides in references/catalogue/.
  const markdown = (dir: string) => existsSync(dir)
    ? readdirSync(dir).filter((name) => name.endsWith('.md')).sort().map((name) => join(dir, name))
    : [];
  const guides = [...markdown(referenceDir), ...markdown(join(referenceDir, 'catalogue'))];
  if (args.flags.has('json')) {
    printJson('skill', {
      schema: 'visser-skill/1',
      toolkit: { sha256: found.release.sha256, version: found.release.version, dir, source: found.source },
      ...(found.document ? { document: found.document } : {}),
      skill: { path: skillPath, text },
      guides,
    });
  } else {
    process.stdout.write(`# toolkit ${found.release.version} ${found.release.sha256} (${found.source}: ${dir})\n# skill: ${skillPath}\n\n${text}${text.endsWith('\n') ? '' : '\n'}\n# guides:\n${guides.map((g) => `${g}\n`).join('')}`);
  }
  return EXIT.ok;
}
