import { MathPolicyError } from '../math/policy.ts';
import { extractJourneyMath } from './journey-math.ts';
import { reconcileJourneyDb, type JourneyDbSnapshot } from './journey-db.ts';
import { journeyMathTransport, type JourneyRenderMath } from './journey-transport.ts';

type Db = Record<string, (...args: unknown[]) => unknown>;
/** Caller installs the real private sanitizer before the normal native parse. */
export async function extractJourneyNodeMath(original: string, rendered: string, db: Db): Promise<JourneyRenderMath | undefined> {
  for (const method of ['getTasks','getSections','getActors','getDiagramTitle','getAccTitle','getAccDescription']) {
    if (typeof db[method] !== 'function') throw new MathPolicyError('E_MATH_INVALID', 'pinned journey snapshot interface changed');
  }
  // getActors reads the array populated by getTasks. Capture it exactly once,
  // before any asynchronous collector work can consult module-level state.
  const tasks = db['getTasks']!();
  const snapshot = structuredClone({tasks,sections:db['getSections']!(),actors:db['getActors']!(),
    title:db['getDiagramTitle']!(),accTitle:db['getAccTitle']!(),accDescr:db['getAccDescription']!()}) as JourneyDbSnapshot;
  const math = await extractJourneyMath(original,undefined,rendered);
  const plan = reconcileJourneyDb(math,snapshot);
  if (!math.total.occurrences) return undefined;
  // JSON and SVG geometry cannot represent nonfinite native scores. Preserve
  // plain parser behavior but reject a math plan that would lose its value.
  if (plan.snapshot.tasks.some(task => !Number.isFinite(task.score))) throw new MathPolicyError('E_MATH_INVALID', 'journey math requires finite task scores for layout');
  return journeyMathTransport(math,plan);
}
