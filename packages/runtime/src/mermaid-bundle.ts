// Own the browser artifact so version-checked family adapters can run before
// Mermaid lays out the diagram. Dynamic chunks are folded into one IIFE.
import mermaid from 'mermaid';
(globalThis as typeof globalThis & { mermaid: typeof mermaid }).mermaid = mermaid;
