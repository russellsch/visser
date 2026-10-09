import {MathPolicyError} from '../math/policy.ts';
import type {ERLabels} from './er-labels.ts';
import type {ERFieldOwner} from './er-owners.ts';
import {ProvenanceText} from './source-provenance.ts';

/** Materialize an already-projected field without text matching. Missing native
 * fields contain no authored units; key separators are explicitly synthetic. */
export function materializeERField(labels:ERLabels,owner:ERFieldOwner):ProvenanceText {
  const get=(index:number)=>{
    const record=labels.records[index];
    if(!Number.isSafeInteger(index)||!record||record.recordIndex!==index)throw new MathPolicyError('E_MATH_INVALID','ER field owner is invalid');
    return record;
  };
  if(owner.kind==='empty'){
    // Projected missing fields always belong to an authored entity/row. Keep
    // that collector's source root even though this field has no units.
    const root=labels.records[0]?.mappedValue;
    if(!root)throw new MathPolicyError('E_MATH_INVALID','ER empty field has no source owner');
    return root.slice(0,0);
  }
  if(owner.kind==='record')return get(owner.recordIndex).mappedValue;
  if(owner.kind!=='joinedKeys'||!owner.recordIndices.length)throw new MathPolicyError('E_MATH_INVALID','ER joined key owner is invalid');
  const records=owner.recordIndices.map(get);
  if(records.some(record=>record.role!=='attribute.key'))throw new MathPolicyError('E_MATH_INVALID','ER joined field must own attribute keys');
  const first=records[0]!.mappedValue,chunks:ProvenanceText[]=[first];
  for(const record of records.slice(1))chunks.push(first.synthetic(','),record.mappedValue);
  return first.slice(0,0).concatAll(chunks);
}
