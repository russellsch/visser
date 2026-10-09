import {isDeepStrictEqual} from 'node:util';
import {MathPolicyError} from '../math/policy.ts';
type Styled={cssStyles:string[];classes:string[]};
export type RequirementNode=Styled&{name:string;type:string;requirementId:string;text:string;risk:string;verifyMethod:string};
export type RequirementElement=Styled&{name:string;type:string;docRef:string};
export type RequirementClass={id:string;styles:string[];textStyles:string[]};
export type RequirementRelation={type:string;src:string;dst:string};
export type RequirementDbSnapshot={version:1;direction:string;title:string;accTitle:string;accDescr:string;
 requirements:Array<[string,RequirementNode]>;elements:Array<[string,RequirementElement]>;
 classes:Array<[string,RequirementClass]>;relations:RequirementRelation[];
 latestRequirement:RequirementNode;latestElement:RequirementElement};
export type RequirementNativeDb={getDirection():string;getDiagramTitle():string;getAccTitle():string;getAccDescription():string;
 getRequirements():Map<string,RequirementNode>;getElements():Map<string,RequirementElement>;getClasses():Map<string,RequirementClass>;getRelationships():RequirementRelation[];
 latestRequirement:RequirementNode;latestElement:RequirementElement};
export type RequirementEffect=
 |{method:'clear';args:readonly []}
 |{method:'setDirection'|'setNewReqId'|'setNewReqText'|'setNewReqRisk'|'setNewReqVerifyMethod'|'setNewElementType'|'setNewElementDocRef'|'addElement'|'setDiagramTitle'|'setAccTitle'|'setAccDescription';args:readonly [string]}
 |{method:'addRequirement';args:readonly [string,string]}
 |{method:'addRelationship';args:readonly [string,string,string]}
 |{method:'setCssStyle'|'setClass'|'defineClass';args:readonly [readonly string[],readonly string[]]};
const newRequirement=():RequirementNode=>({requirementId:'',text:'',risk:'',verifyMethod:'',name:'',type:'',cssStyles:[],classes:['default']});
const newElement=():RequirementElement=>({name:'',type:'',docRef:'',cssStyles:[],classes:['default']});
function invalid(message:string):never{throw new MathPolicyError('E_MATH_INVALID',`Requirement native reconciliation: ${message}`);}

/** Getters expose live maps and rows. Capture before getData mutates their
 * objects with layout fields, and before constructing another native DB clears
 * the shared common metadata. This function does not establish parse success.
 */
export function captureRequirementDb(db:RequirementNativeDb):RequirementDbSnapshot{
 return structuredClone({version:1,direction:db.getDirection(),title:db.getDiagramTitle(),accTitle:db.getAccTitle(),accDescr:db.getAccDescription(),
  requirements:[...db.getRequirements()],elements:[...db.getElements()],classes:[...db.getClasses()],relations:db.getRelationships(),latestRequirement:db.latestRequirement,latestElement:db.latestElement});
}

/** Replay pinned native methods from a fresh TB-direction DB in order, including first declarations and
 * style/class mutation. Common metadata arguments must already be sanitized
 * and normalized to the native setter output by the caller. No source or
 * class-namespace safety claim follows from state parity alone.
 */
export function replayRequirementDb(effects:readonly RequirementEffect[]):RequirementDbSnapshot{
 let requirements=new Map<string,RequirementNode>(),elements=new Map<string,RequirementElement>(),classes=new Map<string,RequirementClass>(),relations:RequirementRelation[]=[];
 let latestRequirement=newRequirement(),latestElement=newElement(),direction='TB',title='',accTitle='',accDescr='';
 for(const effect of effects){
  const {method,args}=effect;
  switch(method){
   case 'clear':requirements=new Map();elements=new Map();classes=new Map();relations=[];latestRequirement=newRequirement();latestElement=newElement();title='';accTitle='';accDescr='';break;
   case 'setDirection':direction=args[0];break;
   case 'setDiagramTitle':title=args[0];break;
   case 'setAccTitle':accTitle=args[0];break;
   case 'setAccDescription':accDescr=args[0];break;
   case 'setNewReqId':latestRequirement.requirementId=args[0];break;
   case 'setNewReqText':latestRequirement.text=args[0];break;
   case 'setNewReqRisk':latestRequirement.risk=args[0];break;
   case 'setNewReqVerifyMethod':latestRequirement.verifyMethod=args[0];break;
   case 'setNewElementType':latestElement.type=args[0];break;
   case 'setNewElementDocRef':latestElement.docRef=args[0];break;
   case 'addRequirement':{
    const [name,type]=args;if(!requirements.has(name))requirements.set(name,{name,type,requirementId:latestRequirement.requirementId,text:latestRequirement.text,risk:latestRequirement.risk,verifyMethod:latestRequirement.verifyMethod,cssStyles:[],classes:['default']});
    latestRequirement=newRequirement();break;
   }
   case 'addElement':{const name=args[0];if(!elements.has(name))elements.set(name,{name,type:latestElement.type,docRef:latestElement.docRef,cssStyles:[],classes:['default']});latestElement=newElement();break;}
   case 'addRelationship':relations.push({type:args[0],src:args[1],dst:args[2]});break;
   case 'setCssStyle':{
    const [ids,styles]=args;
    for(const id of ids){const node=requirements.get(id)??elements.get(id);if(!node)break;for(const style of styles)node.cssStyles.push(...(style.includes(',')?style.split(','):[style]));}break;
   }
   case 'setClass':{
    const [ids,names]=args;for(const id of ids){const node=requirements.get(id)??elements.get(id);if(node)for(const name of names){node.classes.push(name);const styles=classes.get(name)?.styles;if(styles)node.cssStyles.push(...styles);}}break;
   }
   case 'defineClass':{
    const [ids,styles]=args;
    for(const id of ids){let value=classes.get(id);if(!value){value={id,styles:[],textStyles:[]};classes.set(id,value);}
     for(const style of styles){if(/color/.test(style))value.textStyles.push(style.replace('fill','bgFill'));value.styles.push(style);}
     for(const node of [...requirements.values(),...elements.values()])if(node.classes.includes(id))node.cssStyles.push(...styles.flatMap(style=>style.split(',')));
    }break;
   }
   default:invalid('unknown DB effect');
  }
 }
 return structuredClone({version:1,direction,title,accTitle,accDescr,requirements:[...requirements],elements:[...elements],classes:[...classes],relations,latestRequirement,latestElement});
}

export function reconcileRequirementDb(effects:readonly RequirementEffect[],native:RequirementDbSnapshot):RequirementDbSnapshot{
 if(!isDeepStrictEqual(replayRequirementDb(effects),native))invalid('actual nodes, pending declarations, styles, relationships or metadata differ');
 return structuredClone(native);
}
