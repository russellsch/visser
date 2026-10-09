import type { MathSvgElement } from './engine.ts';
import { MathPolicyError } from './policy.ts';

export type MathSvgInkBounds = Readonly<{ left: number; top: number; right: number; bottom: number }>;

type MutableBounds = { left: number; top: number; right: number; bottom: number };
type Point = Readonly<{ x: number; y: number }>;
type Matrix = Readonly<{ a: number; b: number; c: number; d: number; e: number; f: number }>;
type Paint = Readonly<{ fill: boolean; stroke: boolean; strokeWidth: number }>;

const numberSource = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?';
const numberAt = new RegExp(numberSource, 'y');
const transformAt = /(translate|scale|rotate|matrix)\(/y;
const commandAt = /^[MmLlHhVvCcSsQqTtAaZz]$/;
const identity: Matrix = Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
const allowed: Record<MathSvgElement['tag'], ReadonlySet<string>> = {
  svg: new Set(['xmlns', 'width', 'height', 'role', 'focusable', 'viewBox']),
  g: new Set(['stroke', 'fill', 'stroke-width', 'transform', 'data-mml-node', 'data-mjx-texclass']),
  path: new Set(['data-c', 'd', 'transform', 'fill', 'stroke', 'stroke-width']),
  rect: new Set(['width', 'height', 'x', 'y', 'transform', 'fill', 'stroke', 'stroke-width']),
};

function invalid(reason: string): never {
  throw new MathPolicyError('E_MATH_INVALID', `Invalid math SVG ink geometry: ${reason}`);
}

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) invalid(`${name} is not finite`);
  return value;
}

function numeric(value: string | undefined, name: string, fallback?: number): number {
  if (value === undefined) {
    if (fallback === undefined) invalid(`missing ${name}`);
    return fallback;
  }
  if (!new RegExp(`^${numberSource}$`).test(value)) invalid(`${name} is not numeric`);
  return finite(Number(value), name);
}

function union(bounds: MutableBounds | undefined, next: MutableBounds | undefined): MutableBounds | undefined {
  if (!next) return bounds;
  if (!bounds) return { ...next };
  bounds.left = Math.min(bounds.left, next.left);
  bounds.top = Math.min(bounds.top, next.top);
  bounds.right = Math.max(bounds.right, next.right);
  bounds.bottom = Math.max(bounds.bottom, next.bottom);
  return bounds;
}

function pointBounds(...points: Point[]): MutableBounds | undefined {
  let bounds: MutableBounds | undefined;
  for (const point of points) {
    finite(point.x, 'coordinate');
    finite(point.y, 'coordinate');
    bounds = union(bounds, { left: point.x, top: point.y, right: point.x, bottom: point.y });
  }
  return bounds;
}

function multiply(left: Matrix, right: Matrix): Matrix {
  return {
    a: finite(left.a * right.a + left.c * right.b, 'transform.a'),
    b: finite(left.b * right.a + left.d * right.b, 'transform.b'),
    c: finite(left.a * right.c + left.c * right.d, 'transform.c'),
    d: finite(left.b * right.c + left.d * right.d, 'transform.d'),
    e: finite(left.a * right.e + left.c * right.f + left.e, 'transform.e'),
    f: finite(left.b * right.e + left.d * right.f + left.f, 'transform.f'),
  };
}

function transformedPoint(matrix: Matrix, point: Point): Point {
  return {
    x: finite(matrix.a * point.x + matrix.c * point.y + matrix.e, 'transformed x'),
    y: finite(matrix.b * point.x + matrix.d * point.y + matrix.f, 'transformed y'),
  };
}

function transformedBounds(bounds: MutableBounds, matrix: Matrix): MutableBounds {
  return pointBounds(
    transformedPoint(matrix, { x: bounds.left, y: bounds.top }),
    transformedPoint(matrix, { x: bounds.left, y: bounds.bottom }),
    transformedPoint(matrix, { x: bounds.right, y: bounds.top }),
    transformedPoint(matrix, { x: bounds.right, y: bounds.bottom }),
  )!;
}

function skipSpace(value: string, index: number): number {
  while (index < value.length && /[ \t\r\n]/.test(value[index]!)) index++;
  return index;
}

function parseNumbers(value: string, name: string): number[] {
  const values: number[] = [];
  let index = 0;
  let needValue = true;
  while (index < value.length) {
    index = skipSpace(value, index);
    if (index === value.length) break;
    if (value[index] === ',') {
      if (needValue) invalid(`malformed ${name}`);
      needValue = true;
      index++;
      continue;
    }
    numberAt.lastIndex = index;
    const matched = numberAt.exec(value);
    if (!matched || matched.index !== index) invalid(`malformed ${name}`);
    values.push(finite(Number(matched[0]), name));
    index = numberAt.lastIndex;
    needValue = false;
  }
  if (needValue && values.length) invalid(`malformed ${name}`);
  return values;
}

function parseTransform(value: string | undefined): Matrix {
  if (value === undefined) return identity;
  let index = 0;
  let result = identity;
  let count = 0;
  while (index < value.length) {
    index = skipSpace(value, index);
    if (index === value.length) break;
    transformAt.lastIndex = index;
    const match = transformAt.exec(value);
    if (!match) invalid('malformed transform');
    const kind = match[1]!;
    index += match[0].length;
    const start = index;
    while (index < value.length && value[index] !== ')') index++;
    if (index === value.length) invalid('unterminated transform');
    const args = parseNumbers(value.slice(start, index), 'transform argument');
    index++;
    let next: Matrix;
    if (kind === 'matrix') {
      if (args.length !== 6) invalid('matrix requires six arguments');
      next = { a: args[0]!, b: args[1]!, c: args[2]!, d: args[3]!, e: args[4]!, f: args[5]! };
    } else if (kind === 'translate') {
      if (args.length !== 1 && args.length !== 2) invalid('translate requires one or two arguments');
      next = { ...identity, e: args[0]!, f: args[1] ?? 0 };
    } else if (kind === 'scale') {
      if (args.length !== 1 && args.length !== 2) invalid('scale requires one or two arguments');
      next = { ...identity, a: args[0]!, d: args[1] ?? args[0]! };
    } else {
      if (args.length !== 1 && args.length !== 3) invalid('rotate requires one or three arguments');
      const radians = finite(args[0]! * Math.PI / 180, 'rotation');
      const cosine = finite(Math.cos(radians), 'rotation cosine');
      const sine = finite(Math.sin(radians), 'rotation sine');
      const cx = args[1] ?? 0;
      const cy = args[2] ?? 0;
      next = { a: cosine, b: sine, c: -sine, d: cosine,
        e: finite(cx - cosine * cx + sine * cy, 'rotation x'),
        f: finite(cy - sine * cx - cosine * cy, 'rotation y') };
    }
    result = multiply(result, next);
    count++;
  }
  if (!count) invalid('empty transform');
  return result;
}

class PathReader {
  private index = 0;
  private readonly data: string;

  constructor(data: string) { this.data = data; }

  private whitespace(): void { this.index = skipSpace(this.data, this.index); }

  private separator(allowComma: boolean): void {
    this.whitespace();
    if (this.data[this.index] === ',') {
      if (!allowComma) invalid('malformed path separator');
      this.index++;
      this.whitespace();
      if (this.data[this.index] === ',' || this.index === this.data.length) invalid('malformed path separator');
    }
  }

  command(): string | undefined {
    this.whitespace();
    if (this.index === this.data.length) return undefined;
    if (this.data[this.index] === ',') invalid('malformed path separator');
    const value = this.data[this.index]!;
    if (!commandAt.test(value)) return undefined;
    this.index++;
    return value;
  }

  number(allowComma: boolean): number {
    this.separator(allowComma);
    numberAt.lastIndex = this.index;
    const matched = numberAt.exec(this.data);
    if (!matched || matched.index !== this.index) invalid('path command has incomplete arguments');
    this.index = numberAt.lastIndex;
    return finite(Number(matched[0]), 'path number');
  }

  flag(allowComma: boolean): number {
    this.separator(allowComma);
    const value = this.data[this.index];
    if (value !== '0' && value !== '1') invalid('arc flags must be zero or one');
    this.index++;
    return Number(value);
  }

  moreGroups(): boolean {
    this.whitespace();
    if (this.index === this.data.length || commandAt.test(this.data[this.index]!)) return false;
    if (this.data[this.index] === ',' || /[+\-.0-9]/.test(this.data[this.index]!)) return true;
    invalid('malformed path data');
  }

  get done(): boolean {
    this.whitespace();
    return this.index === this.data.length;
  }
}

function addArc(bounds: MutableBounds | undefined, from: Point, to: Point, rxValue: number, ryValue: number,
  degrees: number, large: number, sweep: number): MutableBounds | undefined {
  if ((large !== 0 && large !== 1) || (sweep !== 0 && sweep !== 1)) invalid('arc flags must be zero or one');
  let rx = Math.abs(rxValue);
  let ry = Math.abs(ryValue);
  if (rx === 0 || ry === 0) return union(bounds, pointBounds(from, to));
  const angle = finite(degrees * Math.PI / 180, 'arc rotation');
  const cosine = finite(Math.cos(angle), 'arc rotation cosine');
  const sine = finite(Math.sin(angle), 'arc rotation sine');
  const dx = finite((from.x - to.x) / 2, 'arc delta x');
  const dy = finite((from.y - to.y) / 2, 'arc delta y');
  const xPrime = finite(cosine * dx + sine * dy, 'arc x prime');
  const yPrime = finite(-sine * dx + cosine * dy, 'arc y prime');
  const lambda = finite(xPrime * xPrime / (rx * rx) + yPrime * yPrime / (ry * ry), 'arc radius correction');
  if (lambda > 1) {
    const scale = finite(Math.sqrt(lambda), 'arc radius scale');
    rx = finite(rx * scale, 'arc radius x');
    ry = finite(ry * scale, 'arc radius y');
  }
  const rx2 = finite(rx * rx, 'arc radius x squared');
  const ry2 = finite(ry * ry, 'arc radius y squared');
  const denominator = finite(rx2 * yPrime * yPrime + ry2 * xPrime * xPrime, 'arc center denominator');
  const numerator = finite(rx2 * ry2 - rx2 * yPrime * yPrime - ry2 * xPrime * xPrime, 'arc center numerator');
  const ratio = denominator === 0 ? 0 : Math.max(0, numerator / denominator);
  const coefficient = finite((large === sweep ? -1 : 1) * Math.sqrt(ratio), 'arc center coefficient');
  const cxPrime = finite(coefficient * rx * yPrime / ry, 'arc center x prime');
  const cyPrime = finite(-coefficient * ry * xPrime / rx, 'arc center y prime');
  const cx = finite(cosine * cxPrime - sine * cyPrime + (from.x + to.x) / 2, 'arc center x');
  const cy = finite(sine * cxPrime + cosine * cyPrime + (from.y + to.y) / 2, 'arc center y');
  const extentX = finite(Math.sqrt(rx2 * cosine * cosine + ry2 * sine * sine), 'arc extent x');
  const extentY = finite(Math.sqrt(rx2 * sine * sine + ry2 * cosine * cosine), 'arc extent y');
  return union(bounds, {
    left: finite(cx - extentX, 'arc left'), top: finite(cy - extentY, 'arc top'),
    right: finite(cx + extentX, 'arc right'), bottom: finite(cy + extentY, 'arc bottom'),
  });
}

function pathBounds(d: string): MutableBounds | undefined {
  if (d === '') return undefined;
  const reader = new PathReader(d);
  let command: string | undefined;
  let firstCommand = true;
  let current: Point = { x: 0, y: 0 };
  let start: Point = current;
  let previous: string | undefined;
  let cubicControl: Point | undefined;
  let quadraticControl: Point | undefined;
  let bounds: MutableBounds | undefined;

  const relativePoint = (x: number, y: number, relative: boolean): Point => relative
    ? { x: finite(current.x + x, 'path x'), y: finite(current.y + y, 'path y') } : { x, y };
  const addLine = (to: Point) => { bounds = union(bounds, pointBounds(current, to)); current = to; };

  while (!reader.done) {
    const explicit = reader.command();
    if (explicit) command = explicit;
    else if (!command) invalid('path must begin with a command');
    if (!command) invalid('missing path command');
    const upper = command.toUpperCase();
    if (firstCommand && upper !== 'M') invalid('path must begin with moveto');
    firstCommand = false;
    const relative = command !== upper;
    if (upper === 'Z') {
      if (current.x !== start.x || current.y !== start.y) addLine(start);
      previous = command;
      cubicControl = undefined;
      quadraticControl = undefined;
      command = undefined;
      continue;
    }
    let groups = 0;
    do {
      let argument = 0;
      const number = () => reader.number(groups > 1 || argument++ > 0);
      groups++;
      if (upper === 'M') {
        const to = relativePoint(number(), number(), relative);
        if (groups === 1) { current = to; start = to; }
        else addLine(to);
      } else if (upper === 'L') addLine(relativePoint(number(), number(), relative));
      else if (upper === 'H') addLine({ x: relative ? finite(current.x + number(), 'path x') : number(), y: current.y });
      else if (upper === 'V') addLine({ x: current.x, y: relative ? finite(current.y + number(), 'path y') : number() });
      else if (upper === 'C') {
        const first = relativePoint(number(), number(), relative);
        const second = relativePoint(number(), number(), relative);
        const to = relativePoint(number(), number(), relative);
        bounds = union(bounds, pointBounds(current, first, second, to)); current = to; cubicControl = second;
      } else if (upper === 'S') {
        const first = previous && 'CcSs'.includes(previous) && cubicControl
          ? { x: finite(2 * current.x - cubicControl.x, 'path reflected x'), y: finite(2 * current.y - cubicControl.y, 'path reflected y') } : current;
        const second = relativePoint(number(), number(), relative);
        const to = relativePoint(number(), number(), relative);
        bounds = union(bounds, pointBounds(current, first, second, to)); current = to; cubicControl = second;
      } else if (upper === 'Q') {
        const control = relativePoint(number(), number(), relative);
        const to = relativePoint(number(), number(), relative);
        bounds = union(bounds, pointBounds(current, control, to)); current = to; quadraticControl = control;
      } else if (upper === 'T') {
        const control = previous && 'QqTt'.includes(previous) && quadraticControl
          ? { x: finite(2 * current.x - quadraticControl.x, 'path reflected x'), y: finite(2 * current.y - quadraticControl.y, 'path reflected y') } : current;
        const to = relativePoint(number(), number(), relative);
        bounds = union(bounds, pointBounds(current, control, to)); current = to; quadraticControl = control;
      } else if (upper === 'A') {
        const rx = number(); const ry = number(); const rotation = number();
        const large = reader.flag(true); const sweep = reader.flag(true);
        const to = relativePoint(number(), number(), relative);
        bounds = addArc(bounds, current, to, rx, ry, rotation, large, sweep); current = to;
      } else invalid(`unsupported path command ${command}`);
      previous = command;
      if (upper !== 'C' && upper !== 'S') cubicControl = undefined;
      if (upper !== 'Q' && upper !== 'T') quadraticControl = undefined;
    } while (reader.moreGroups());
  }
  if (firstCommand) return undefined;
  return bounds;
}

function nodePaint(attrs: Record<string, string>, inherited: Paint): Paint {
  const fillValue = attrs.fill ?? (inherited.fill ? 'currentColor' : 'none');
  const strokeValue = attrs.stroke ?? (inherited.stroke ? 'currentColor' : 'none');
  if ((fillValue !== 'none' && fillValue !== 'currentColor') || (strokeValue !== 'none' && strokeValue !== 'currentColor')) invalid('unsupported paint');
  const strokeWidth = numeric(attrs['stroke-width'], 'stroke-width', inherited.strokeWidth);
  if (strokeWidth < 0) invalid('negative stroke-width');
  return { fill: fillValue !== 'none', stroke: strokeValue !== 'none', strokeWidth };
}

function validateViewBox(value: string): void {
  const fields = value.trim().split(/[\s,]+/);
  if (fields.length !== 4) invalid('viewBox must have four numbers');
  const numbers = fields.map((field, index) => numeric(field, `viewBox[${index}]`));
  if (numbers[2]! <= 0 || numbers[3]! <= 0) invalid('viewBox extent must be positive');
}

function validateNode(node: unknown, root: boolean): asserts node is MathSvgElement {
  if (!node || typeof node !== 'object' || Array.isArray(node)) invalid('node is not an object');
  const candidate = node as Partial<MathSvgElement>;
  if (candidate.tag !== 'svg' && candidate.tag !== 'g' && candidate.tag !== 'path' && candidate.tag !== 'rect') invalid('unsupported SVG element');
  if (root && candidate.tag !== 'svg') invalid('root is not an SVG element');
  if (!root && candidate.tag === 'svg') invalid('nested SVG is unsupported');
  if (!candidate.attrs || typeof candidate.attrs !== 'object' || Array.isArray(candidate.attrs)) invalid('attributes are not an object');
  if (!Array.isArray(candidate.children)) invalid('children are not an array');
  for (const [name, value] of Object.entries(candidate.attrs)) {
    if (!allowed[candidate.tag].has(name) || typeof value !== 'string') invalid(`unsupported ${candidate.tag} attribute`);
    if (name === 'viewBox') validateViewBox(value);
  }
  if ((candidate.tag === 'path' || candidate.tag === 'rect') && candidate.children.length) invalid('geometry elements cannot have children');
}

function localBounds(node: MathSvgElement): MutableBounds | undefined {
  if (node.tag === 'path') return pathBounds(node.attrs.d ?? invalid('path has no d attribute'));
  if (node.tag === 'rect') {
    const x = numeric(node.attrs.x, 'rect x', 0);
    const y = numeric(node.attrs.y, 'rect y', 0);
    const width = numeric(node.attrs.width, 'rect width', 0);
    const height = numeric(node.attrs.height, 'rect height', 0);
    if (width < 0 || height < 0) invalid('negative rect extent');
    return { left: x, top: y, right: finite(x + width, 'rect right'), bottom: finite(y + height, 'rect bottom') };
  }
  return undefined;
}

function inkBounds(node: MathSvgElement, inheritedMatrix: Matrix, inheritedPaint: Paint, root = false): MutableBounds | undefined {
  validateNode(node, root);
  const matrix = multiply(inheritedMatrix, parseTransform(node.attrs.transform));
  const paint = nodePaint(node.attrs, inheritedPaint);
  let result: MutableBounds | undefined;
  const local = localBounds(node);
  if (local) {
    let painted: MutableBounds | undefined;
    if (paint.fill && !(node.tag === 'rect' && (local.left === local.right || local.top === local.bottom))) painted = { ...local };
    if (paint.stroke) {
      const inflation = finite(2 * paint.strokeWidth, 'stroke inflation');
      painted = union(painted, { left: finite(local.left - inflation, 'stroke left'), top: finite(local.top - inflation, 'stroke top'),
        right: finite(local.right + inflation, 'stroke right'), bottom: finite(local.bottom + inflation, 'stroke bottom') });
    }
    if (painted) result = union(result, transformedBounds(painted, matrix));
  }
  for (const child of node.children) {
    validateNode(child, false);
    result = union(result, inkBounds(child, matrix, paint));
  }
  return result;
}

/**
 * Returns a conservative painted bounds for a sanitized MathJax SVG tree.
 * Bounds are expressed in the outer SVG's user coordinate system; viewBox
 * scaling is intentionally not applied here.
 */
export function mathSvgInkBounds(svg: MathSvgElement): MathSvgInkBounds | undefined {
  validateNode(svg, true);
  return inkBounds(svg, identity, { fill: true, stroke: false, strokeWidth: 1 }, true);
}
