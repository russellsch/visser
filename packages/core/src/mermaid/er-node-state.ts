import {isDeepStrictEqual} from 'node:util';
import {MathPolicyError} from '../math/policy.ts';
import {captureERNodeState} from './er-node-db.ts';
import {extractERLabels} from './er-labels.ts';
import {normalizeERDbEffects} from './er-db-effects.ts';
import {reconcileERDb} from './er-db.ts';
import {projectEROwners} from './er-owners.ts';
import {prepareERDisplayMath} from './er-display-math.ts';
import {normalizeMermaidSource} from './rules.ts';

/** Consume native completion before awaiting any source work. This connects
 * independently collected grammar effects to the exact completed native input
 * and stored state, without consulting mutable live native/common getters. */
export async function reconcileERNodeState(
  db:object,parserSource:string,original:string,rendered=normalizeMermaidSource(original),
) {
  const completed=captureERNodeState(db,parserSource);
  const labels=await extractERLabels(original,rendered);
  if(labels.parserSource!==completed.source)throw new MathPolicyError('E_MATH_INVALID','ER completed parser source differs from authored source');
  const expected=labels.effects.map(({method,args})=>({method,args}));
  if(!isDeepStrictEqual(expected,completed.effects))throw new MathPolicyError('E_MATH_INVALID','ER native callback trace differs from authored grammar');
  const normalized=await normalizeERDbEffects(labels,completed.htmlLabels);
  reconcileERDb(normalized.effects,completed.snapshot,completed.options);
  const owners=projectEROwners(labels,normalized,completed.snapshot);
  const math=await prepareERDisplayMath(original,labels,normalized,owners,completed.htmlLabels);
  return Object.freeze({labels,normalized,completed,owners,math});
}
