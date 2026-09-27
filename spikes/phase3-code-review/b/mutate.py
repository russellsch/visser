# One mutation at a time on the scratch copy; record whether the targeted tests catch it.
import subprocess, sys
M = "tmp/mut/"
TESTS = ["tests/unit/references.retire-frontmatter.test.ts", "tests/integration/retire.test.ts", "tests/integration/fork.test.ts",
         "tests/integration/refs.test.ts", "tests/unit/validate.fixtures.test.ts"]
muts = [
  ("frontmatter: skip checkEdit in insert", "packages/core/src/references/frontmatter-edit.ts",
   "  checkEdit(before, lines, 'retiredTargets', expected);\n  return joinFrontmatter({ ...fm, lines });", "  return joinFrontmatter({ ...fm, lines });"),
  ("frontmatter: accept any indentation", "packages/core/src/references/frontmatter-edit.ts",
   "if (content.length > 0 && !/^ {2}\\S/.test(content[0]!.line)) {", "if (false) {"),
  ("reason: allow control characters", "packages/core/src/references/frontmatter-edit.ts",
   "if (/[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]/.test(reason))", "if (false)"),
  ("retire: skip referrer check", "packages/core/src/references/retire.ts",
   "if (referrers.length > 0) fail(", "if (false) fail("),
  ("retire: skip chain check", "packages/core/src/references/retire.ts",
   "if (chained.length > 0) {", "if (false) {"),
  ("retire: nested targets not retired", "packages/core/src/references/retire.ts",
   "const removed = [packet.targetId, ...descendantsOf(bundle.model.targets, packet.targetId)];", "const removed = [packet.targetId];"),
  ("retire: keep separating blank line", "packages/core/src/references/retire.ts",
   "  if (endsWithNewline && bytes[to] === 0x0a) to += 1;", "  if (false) to += 1;"),
  ("retire: allow Mermaid in-fence target", "packages/core/src/references/retire.ts",
   "    if (record.kind.startsWith('mermaid-')) {\n      fail('E_REF_INVALID', `${packet.targetId} is inside Mermaid figure", "    if (false) {\n      fail('E_REF_INVALID', `${packet.targetId} is inside Mermaid figure"),
  ("replace --retire: allow non-nested IDs", "packages/core/src/references/replace.ts",
   "if (!nested.has(entry.id)) fail(", "if (false) fail("),
  ("guardedWrite: skip raw-hash recheck", "packages/core/src/references/guarded-write.ts",
   "if (lstatSync(indexPath).isSymbolicLink() || sha256Hex(new Uint8Array(readFileSync(indexPath))) !== rawHash) {", "if (false) {"),
  ("guardedWrite: skip candidate error check", "packages/core/src/references/guarded-write.ts",
   "    if (firstError) fail(firstError.code,", "    if (false) fail(firstError!.code,"),
  ("fork: accept symlinked files", "packages/core/src/references/fork.ts",
   "  if (stat.isSymbolicLink()) fail('E_PATH_ESCAPE',", "  if (false) fail('E_PATH_ESCAPE',"),
  ("fork: existence check instead of claim", "packages/core/src/references/fork.ts",
   "    try {\n      mkdirSync(realTarget);", "    if (existsSync(realTarget)) fail('E_USAGE', 'exists');\n    try {\n      if (false) mkdirSync(realTarget);"),
  ("fork: DEST inside source allowed", "packages/core/src/references/fork.ts",
   "if (isInside(realTarget, realSource)) fail(", "if (false) fail("),
]
for label, path, old, new in muts:
    p = M + path
    src = open(p).read()
    if src.count(old) != 1:
        print(f"{label:44} SKIP (anchor count {src.count(old)})"); continue
    open(p, "w").write(src.replace(old, new))
    r = subprocess.run(["npx", "vitest", "run", *TESTS], cwd=M, capture_output=True, text=True, timeout=600)
    open(p, "w").write(src)
    out = r.stdout + r.stderr
    line = next((l.strip() for l in out.splitlines() if l.strip().startswith("Tests ")), "?")
    print(f"{label:44} {'CAUGHT' if r.returncode != 0 else 'MISSED'}  {line}")
