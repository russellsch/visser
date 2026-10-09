// Node-only worker. Keep stdout exclusively for the bounded JSON protocol.
import { convertMath } from './engine.ts';
import type { MathWorkerReply } from './validate.ts';
import { MATH_LIMITS } from './policy.ts';
import { MATH_PROCESS_LIMITS } from './process-policy.ts';

async function main(): Promise<void> {
  // Pipe chunks may end inside a code point. Preserve source/key bytes across
  // chunk boundaries before counting the decoded, valid UTF-8 JSON request.
  process.stdin.setEncoding('utf8');
  let input = '';
  let inputBytes = 0;
  for await (const chunk of process.stdin) {
    const text = String(chunk);
    inputBytes += Buffer.byteLength(text, 'utf8');
    if (inputBytes > MATH_PROCESS_LIMITS.ipcBytes) throw new Error('input limit');
    input += text;
  }
  const parsed = JSON.parse(input) as { expressions: Array<{ key: string; tex: string; display: boolean }> };
  if (!Array.isArray(parsed.expressions) || parsed.expressions.length > MATH_LIMITS.documentOccurrences) throw new Error('request limit');
  const results: MathWorkerReply['results'] = [];
  for (const request of parsed.expressions) {
    if (typeof request.key !== 'string' || typeof request.tex !== 'string' || typeof request.display !== 'boolean') throw new Error('invalid request');
    try { results.push({ key: request.key, conversion: convertMath(request.tex, request.display) }); }
    catch (error) {
      const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' && error.code.endsWith('_LIMIT') ? 'E_LIMIT' : 'E_MATH';
      results.push({ key: request.key, code, error: (error instanceof Error ? error.message : String(error)).slice(0, 500) });
    }
  }
  const output = JSON.stringify({ results });
  if (Buffer.byteLength(output, 'utf8') > MATH_PROCESS_LIMITS.ipcBytes) throw new Error('output limit');
  process.stdout.write(output);
}

main().catch(() => { process.stderr.write('math validation worker failed\n'); process.exitCode = 1; });
