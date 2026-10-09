import {sequenceSanitizedMathText} from './sequence-text.ts';
import type {RequirementLabelRole} from './requirement-labels.ts';
const prefixes:Partial<Record<RequirementLabelRole,string>>={'requirement.id':'ID: ','requirement.text':'Text: ','requirement.risk':'Risk: ','requirement.verifyMethod':'Verification: ','element.type':'Type: ','element.docRef':'Doc Ref: '};
export const requirementRowPrefix=(role:RequirementLabelRole):string=>prefixes[role]??'';
/** Adapter input for a prelayout row hook, not unmodified native createText.
 * Keep standard TeX backslashes. Recover one sanitation layer only inside
 * existing formulas; break tags cannot join two halves of an equation.
 */
export const requirementMathText=(text:string):string=>sequenceSanitizedMathText(text);
