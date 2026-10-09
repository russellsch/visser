import { convert } from './engine.mjs';
import { gzipSync } from 'node:zlib';
const formulas = [String.raw`x_i`, String.raw`\frac{a}{b}`, String.raw`\begin{matrix}a&b\\c&d\end{matrix}`,
  String.raw`\begin{aligned}E&=mc^2\\a&=\frac{1}{2}\end{aligned}`,
  String.raw`\int_0^\infty e^{-x}\,dx`, String.raw`\mathbb{R}`, String.raw`\notACommand{x}`];
for (const tex of formulas) {
  const start = performance.now();
  try {
    const result = convert(tex);
    console.log(JSON.stringify({tex, attrs:result.attrs, bytes:Buffer.byteLength(result.markup),gzip:gzipSync(result.markup).length,ms:performance.now()-start}));
  } catch (error) { console.log(JSON.stringify({tex, error:String(error)})); }
}
