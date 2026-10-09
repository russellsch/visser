// Classic-worker bundle entry. Deliberately no imports at runtime after bundling.
import { convert } from '../math-rendering/engine.mjs';

self.onmessage = ({ data }) => {
  const { id, texes, loop } = data;
  const start = performance.now();
  try {
    if (loop) {
      self.postMessage({ id, started: true });
      for (let i = 0; i < loop; i++) convert(String.raw`\begin{matrix}a&b\\c&d\end{matrix}`);
      self.postMessage({ id, ok: true, ms: performance.now() - start, loop });
      return;
    }
    const outputs = texes.map((tex) => convert(tex).markup);
    self.postMessage({ id, ok: true, ms: performance.now() - start, outputs });
  } catch (error) {
    self.postMessage({ id, ok: false, ms: performance.now() - start, error: String(error).slice(0, 300) });
  }
};
