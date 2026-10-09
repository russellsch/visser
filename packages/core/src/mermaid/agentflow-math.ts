import {EMPTY_MATH_RESOURCE_TOTAL,type MathResourceTotal} from '../math/policy.ts';
import {normalizeMermaidSource} from './rules.ts';
import {extractAgentflowLabels} from './agentflow-labels.ts';
import {decodeAgentflowMetadata} from './agentflow-metadata.ts';
import {validateFlowchartLabelRecords} from './flowchart-math.ts';

export async function extractAgentflowMath(
  original: string, initial: MathResourceTotal = EMPTY_MATH_RESOURCE_TOTAL,
  rendered: string = normalizeMermaidSource(original),
) {
  return validateFlowchartLabelRecords(original, await extractAgentflowLabels(original, rendered), initial, decodeAgentflowMetadata);
}
