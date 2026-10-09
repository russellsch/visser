// Browser-independent box classification for the restricted Mermaid profile.
// The pinned native parser uses CSS.supports; the isolated worker has no DOM.
import { MathPolicyError } from '../math/policy.ts';

// Named colors admitted by CSS.supports('color', ...). Sequence's source
// contract permits only a word or rgb()/rgba() in the box-color position.
// System color names from installed mdn-data/css/syntaxes.json; browser parity
// tests verify this classification against the supported Chromium runtime.
const SYSTEM_COLORS = new Set('accentcolor|accentcolortext|activetext|buttonborder|buttonface|buttontext|canvas|canvastext|field|fieldtext|graytext|highlight|highlighttext|linktext|mark|marktext|selecteditem|selecteditemtext|visitedtext|activeborder|activecaption|appworkspace|background|buttonhighlight|buttonshadow|captiontext|inactiveborder|inactivecaption|inactivecaptiontext|infobackground|infotext|menu|menutext|scrollbar|threeddarkshadow|threedface|threedhighlight|threedlightshadow|threedshadow|window|windowframe|windowtext'.split('|'));
const NAMED_COLORS = new Set(('aliceblue|antiquewhite|aqua|aquamarine|azure|beige|bisque|black|blanchedalmond|blue|blueviolet|brown|burlywood|cadetblue|chartreuse|chocolate|coral|cornflowerblue|cornsilk|crimson|cyan|darkblue|darkcyan|darkgoldenrod|darkgray|darkgreen|darkgrey|darkkhaki|darkmagenta|darkolivegreen|darkorange|darkorchid|darkred|darksalmon|darkseagreen|darkslateblue|darkslategray|darkslategrey|darkturquoise|darkviolet|deeppink|deepskyblue|dimgray|dimgrey|dodgerblue|firebrick|floralwhite|forestgreen|fuchsia|gainsboro|ghostwhite|gold|goldenrod|gray|green|greenyellow|grey|honeydew|hotpink|indianred|indigo|ivory|khaki|lavender|lavenderblush|lawngreen|lemonchiffon|lightblue|lightcoral|lightcyan|lightgoldenrodyellow|lightgray|lightgreen|lightgrey|lightpink|lightsalmon|lightseagreen|lightskyblue|lightslategray|lightslategrey|lightsteelblue|lightyellow|lime|limegreen|linen|magenta|maroon|mediumaquamarine|mediumblue|mediumorchid|mediumpurple|mediumseagreen|mediumslateblue|mediumspringgreen|mediumturquoise|mediumvioletred|midnightblue|mintcream|mistyrose|moccasin|navajowhite|navy|oldlace|olive|olivedrab|orange|orangered|orchid|palegoldenrod|palegreen|paleturquoise|palevioletred|papayawhip|peachpuff|peru|pink|plum|powderblue|purple|rebeccapurple|red|rosybrown|royalblue|saddlebrown|salmon|sandybrown|seagreen|seashell|sienna|silver|skyblue|slateblue|slategray|slategrey|snow|springgreen|steelblue|tan|teal|thistle|tomato|turquoise|violet|wheat|white|whitesmoke|yellow|yellowgreen|transparent|currentcolor|inherit|initial|unset|revert|revert-layer').split('|'));

/** CSS legacy comma RGB syntax admitted by rules.ts, including alpha aliases. */
function rgbColor(value: string): boolean {
  const match = /^rgba?\((.*)\)$/.exec(value);
  if (!match) return false;
  const channels = match[1]!.split(',').map(part => part.trim());
  if (channels.length !== 3 && channels.length !== 4) return false;
  if (channels.some(part => !/^(?:\d*\.)?\d+%?$/.test(part))) return false;
  // CSS's legacy syntax cannot mix numbers and percentages in RGB channels.
  const percent = channels[0]!.endsWith('%');
  return channels.slice(0, 3).every(part => part.endsWith('%') === percent);
}

export function parseSequenceBoxData(raw: string): {
  data: { color: string; text?: string; wrap?: boolean }; usesColor: boolean;
} {
  const match = /^((?:rgba?|hsla?)\s*\(.*\)|\w*)(.*)$/.exec(raw);
  if (!match) throw new MathPolicyError('E_MATH_INVALID', 'sequence box has no pinned color/title split');
  const color = match[1]!.trim();
  const usesColor = NAMED_COLORS.has(color.toLowerCase()) || SYSTEM_COLORS.has(color.toLowerCase()) || rgbColor(color);
  const title = (usesColor ? match[2]! : raw).trim();
  const directive = /^:?(no)?wrap:/.exec(title);
  const clean = (directive ? title.slice(directive[0].length) : title).trim();
  return { usesColor, data: { color: usesColor ? color : 'transparent', text: clean || undefined,
    wrap: directive ? !directive[1] : undefined } };
}
