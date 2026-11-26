import type { AnswerHandleStore, StoredAnswer } from "./many-users-api.ts";

/** An {@link AnswerHandleStore} in memory, for one scope. */
export function memoryAnswerHandles(): AnswerHandleStore & { readonly size: () => number } {
  const byPoint = new Map<string, string>();
  const answers = new Map<string, StoredAnswer>();
  const keyOf = (runId: string, handle: string) => `${runId}\n${handle}`;
  return {
    async claim(runId, pointKey, candidate, answer) {
      const stored = byPoint.get(`${runId}\n${pointKey}`);
      if (stored !== undefined && answers.has(keyOf(runId, stored))) return stored;
      byPoint.set(`${runId}\n${pointKey}`, candidate);
      answers.set(keyOf(runId, candidate), answer);
      return candidate;
    },
    async get(runId, handle) {
      return answers.get(keyOf(runId, handle)) ?? null;
    },
    async spend(runId, handle) {
      return answers.delete(keyOf(runId, handle));
    },
    size: () => answers.size,
  };
}
