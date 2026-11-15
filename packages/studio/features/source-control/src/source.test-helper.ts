import type { ChangesRead, ChangesSource, FileTexts, VersionInput } from "./api.ts";

/**
 * A source whose answer and failures a test sets, and which a test can wake as the window coming
 * to the front would. `turnedOn` counts the times Turn on history reached it.
 */
export function fakeSource(initial: ChangesRead) {
  let answer = initial;
  let readFailure: unknown;
  let turnOnFailure: unknown;
  let versionFailure: unknown;
  let turnedOn = 0;
  const texts = new Map<string, FileTexts>();
  const replaced: { path: string; text: string; expected: string }[] = [];
  const versions: VersionInput[] = [];
  const listeners = new Set<() => void>();
  const source: ChangesSource = {
    read: async () => {
      if (readFailure !== undefined) throw readFailure;
      return answer;
    },
    readTexts: async (change) => {
      const found = texts.get(change.path);
      if (found === undefined) throw new Error(`no texts for ${change.path}`);
      return found;
    },
    replaceFile: async (path, text, expected) => {
      replaced.push({ path, text, expected });
      const current = texts.get(path);
      if (current?.after !== expected) return "changed-on-disk";
      texts.set(path, { ...current, after: text });
      return "replaced";
    },
    createVersion: async (input) => {
      if (versionFailure !== undefined) throw versionFailure;
      versions.push(input);
      const recorded = new Set(input.paths);
      if (answer.kind === "ready") {
        answer = { kind: "ready", changes: answer.changes.filter((c) => !recorded.has(c.path)) };
      }
    },
    turnOnHistory: async () => {
      turnedOn += 1;
      if (turnOnFailure !== undefined) throw turnOnFailure;
      answer = { kind: "ready", changes: [] };
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    source,
    /** What the next read answers. */
    answer: (next: ChangesRead) => {
      answer = next;
    },
    /** What a changed file's last version and current texts are. */
    setTexts: (path: string, value: FileTexts) => {
      texts.set(path, value);
    },
    /** Every `replaceFile` call, in order. */
    replaced,
    /** Makes reads fail with `error`; `undefined` makes them work again. */
    failReads: (error: unknown) => {
      readFailure = error;
    },
    /** Every version `createVersion` recorded, in order. */
    versions,
    /** Makes Create version fail with `error`; `undefined` makes it work again. */
    failVersion: (error: unknown) => {
      versionFailure = error;
    },
    /** Makes Turn on history fail with `error`. */
    failTurnOn: (error: unknown) => {
      turnOnFailure = error;
    },
    /** The window came to the front, or a save may have changed a file. */
    wake: () => {
      for (const listener of [...listeners]) listener();
    },
    turnedOn: () => turnedOn,
    listenerCount: () => listeners.size,
  };
}

/** Lets the reads a test started settle. */
export async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
