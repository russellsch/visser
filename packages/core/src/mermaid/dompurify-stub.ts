// Build-time stand-in for DOMPurify (§9.12 "Shipping the parser"). The Mermaid
// parser only needs `addHook`, `removeHook`, and `sanitize` to exist; the build
// extracts structure and never renders HTML from these strings (the compiler
// escapes every label). The browser renderer uses Mermaid's real DOMPurify.
const purify = {
  isSupported: true,
  addHook(): void {},
  removeHook(): void {},
  removeHooks(): void {},
  removeAllHooks(): void {},
  setConfig(): void {},
  clearConfig(): void {},
  sanitize(input: unknown): string {
    return String(input);
  },
};

export default purify;
