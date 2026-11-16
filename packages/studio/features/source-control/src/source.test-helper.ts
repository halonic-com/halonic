import type {
  ChangesRead,
  ChangesSource,
  FileTexts,
  KeptFile,
  Version,
  UpdatesResult,
  VersionInput,
} from "./api.ts";

/**
 * A source whose answer and failures a test sets, and which a test can wake as the window coming
 * to the front would. `turnedOn` counts the times Turn on history reached it.
 */
export function fakeSource(initial: ChangesRead) {
  let answer = initial;
  let readFailure: unknown;
  let turnOnFailure: unknown;
  let versionFailure: unknown;
  let historyFailure: unknown;
  let turnedOn = 0;
  let recorded: readonly Version[] = [];
  const historyLimits: number[] = [];
  let remote = false;
  let updates: UpdatesResult = { kind: "up-to-date" };
  let updatesFailure: unknown;
  let updatesAsked = 0;
  const texts = new Map<string, FileTexts>();
  const replaced: { path: string; text: string; expected: string | null }[] = [];
  const removed: { path: string; expected: string }[] = [];
  const kept: KeptFile[][] = [];
  let keepFailure: unknown;
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
      if ((current?.after ?? null) !== expected) return "changed-on-disk";
      texts.set(path, { before: current?.before ?? null, after: text });
      return "replaced";
    },
    removeFile: async (path, expected) => {
      removed.push({ path, expected });
      const current = texts.get(path);
      if (current?.after !== expected) return "changed-on-disk";
      texts.set(path, { ...current, after: null });
      return "replaced";
    },
    keepCopy: async (files) => {
      if (keepFailure !== undefined) throw keepFailure;
      kept.push([...files]);
    },
    readHistory: async (limit) => {
      historyLimits.push(limit);
      if (historyFailure !== undefined) throw historyFailure;
      return recorded.slice(0, limit);
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
    hasRemote: async () => remote,
    getUpdates: async () => {
      updatesAsked += 1;
      if (updatesFailure !== undefined) throw updatesFailure;
      return updates;
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
    /** Every `removeFile` call, in order. */
    removed,
    /** The files each `keepCopy` call was given, in order. */
    kept,
    /** Makes keeping a copy fail with `error`; `undefined` makes it work again. */
    failKeep: (error: unknown) => {
      keepFailure = error;
    },
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
    /** The versions the history holds, newest first. */
    setHistory: (versions: readonly Version[]) => {
      recorded = versions;
    },
    /** Makes reading the history fail with `error`; `undefined` makes it work again. */
    failHistory: (error: unknown) => {
      historyFailure = error;
    },
    /** The `limit` of every `readHistory` call, in order. */
    historyLimits,
    /** Makes Turn on history fail with `error`. */
    failTurnOn: (error: unknown) => {
      turnOnFailure = error;
    },
    /** Whether the folder has a place to get updates from. */
    setRemote: (has: boolean) => {
      remote = has;
    },
    /** What the next Get updates finds. */
    setUpdates: (next: UpdatesResult) => {
      updates = next;
    },
    /** Makes Get updates fail with `error`; `undefined` makes it work again. */
    failUpdates: (error: unknown) => {
      updatesFailure = error;
    },
    /** How many times Get updates reached the source. */
    updatesAsked: () => updatesAsked,
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
