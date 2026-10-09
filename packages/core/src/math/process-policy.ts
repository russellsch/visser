/** Limits for the parent/worker JSON transport and the isolated typesetter. */
export const MATH_PROCESS_LIMITS = Object.freeze({
  heapMiB: 128,
  timeoutMs: 5000,
  ipcBytes: 16 * 1024 * 1024,
});
