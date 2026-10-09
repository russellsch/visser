import {createHash} from 'node:crypto';

const ER_ARTIFACT='1437bfbd601358cd7f2e54d540410bdebc9bdd38131300d16c49705811f9de49';
const hash=source=>createHash('sha256').update(source).digest('hex');
const rule14='          case 14:\n            return 76;';
const helper=`function visserERMathQuoted(input) {
  if (typeof input !== "string" || input.length < 2 || input[0] !== '"' || input.at(-1) !== '"') return false;
  if (/[\\r\\n\\v\\x08]/.test(input) || !input.includes("\\\\")) return false;
  const text = input.slice(1, -1);
  let offset = 0, paired = false;
  while (offset < text.length) {
    if (text.startsWith("$$", offset)) {
      const end = text.indexOf("$$", offset + 2);
      if (end < 0) return false;
      if (/[\\u2028\\u2029]/.test(text.slice(offset + 2, end))) return false;
      paired = true;
      offset = end + 2;
      continue;
    }
    if (text[offset] === "\\\\" || text[offset] === "%") return false;
    offset++;
  }
  return paired;
}\n`;
function original(source){if(hash(source)!==ER_ARTIFACT)throw new Error('Mermaid ER grammar artifact changed; review lexical admission');}
function initialOwnsRule14(source){
 const conditions=[...source.matchAll(/"([^"\\]+)": \{ "rules": \[([^\]]*)\]/g)];
 const owners=conditions.filter(([, ,rules])=>rules.split(',').map(Number).includes(14)).map(([,name])=>name);
 if(owners.length!==1||owners[0]!=='INITIAL')throw new Error('Mermaid ER rule 14 condition changed');
}

/** Redirects only the broad quoted INITIAL lexer rule when its raw bytes carry admitted TeX. */
export function patchERMathGrammar(source,transformed=source){
 original(source);initialOwnsRule14(source);
 if(transformed.includes('visserERMathQuoted'))throw new Error('Mermaid ER grammar already patched');
 if(source.split(rule14).length!==2||transformed.split(rule14).length!==2)throw new Error('Mermaid ER rule 14 action changed');
 return helper+transformed.replace(rule14,'          case 14:\n            return visserERMathQuoted(yy_.yytext) ? 53 : 76;');
}
