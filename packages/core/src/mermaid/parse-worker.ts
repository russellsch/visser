// Register parser load hooks before Node loads the worker dependency graph.
import './radar-parser-bootstrap.ts';
export type {RawFlowchart,RawState,RawSequence,RawResult} from './parse-worker-main.ts';
void import('./parse-worker-main.ts').catch((error:unknown)=>{
 process.stderr.write(`mermaid parse worker bootstrap failed: ${error instanceof Error?error.stack:String(error)}\n`);
 process.exit(1);
});
