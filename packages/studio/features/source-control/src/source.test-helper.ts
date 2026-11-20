import type {
  ChangesRead,
  ChangesSource,
  FileTexts,
  Identity,
  KeptFile,
  MergeStart,
  UpdateChoice,
  UpdateMerge,
  UpdatesResult,
  Version,
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
  // Set, so the tests of Create version don't ask who versions are from.
  let identity: Identity = { name: "Sam Smith", email: "sam@acme.example" };
  let identityFailure: unknown;
  const identities: Identity[] = [];
  let identityReads = 0;
  let recorded: readonly Version[] = [];
  const historyLimits: number[] = [];
  let remote = false;
  let updates: UpdatesResult = { kind: "up-to-date" };
  let updatesFailure: unknown;
  let remoteFailure: unknown;
  let unshared = 0;
  let unsharedIds: readonly string[] = [];
  let waiting = 0;
  let checkFailure: unknown;
  let checkCalls = 0;
  let shareFailure: unknown;
  let shareGate: Promise<void> = Promise.resolve();
  let shareCalls = 0;
  const remotes: string[] = [];
  let updatesAsked = 0;
  let merge: UpdateMerge | null = null;
  let mergeStart: MergeStart = { kind: "not-needed" };
  let mergeFailure: unknown;
  const mergeCalls: string[] = [];
  const texts = new Map<string, FileTexts>();
  const replaced: { path: string; text: string; expected: string | null }[] = [];
  const removed: { path: string; expected: string }[] = [];
  const putBack = new Set<string>();
  const kept: KeptFile[][] = [];
  let keepFailure: unknown;
  const atVersion = new Map<string, string>();
  let atVersionFailure: unknown;
  const versions: VersionInput[] = [];
  const listeners = new Set<() => void>();
  const source: ChangesSource = {
    read: async () => {
      if (readFailure !== undefined) throw readFailure;
      if (answer.kind !== "ready") return answer;
      // A file put back as its last version is no longer changed.
      return { kind: "ready", changes: answer.changes.filter((c) => !putBack.has(c.path)) };
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
      if (text === current?.before) putBack.add(path);
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
    readFile: async (path) => texts.get(path)?.after ?? null,
    readAtVersion: async (versionId, path) => {
      if (atVersionFailure !== undefined) throw atVersionFailure;
      return atVersion.get(`${versionId}:${path}`) ?? null;
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
    readIdentity: async () => {
      identityReads += 1;
      return identity;
    },
    setIdentity: async (next) => {
      if (identityFailure !== undefined) throw identityFailure;
      identities.push(next);
      identity = next;
    },
    turnOnHistory: async () => {
      turnedOn += 1;
      if (turnOnFailure !== undefined) throw turnOnFailure;
      answer = { kind: "ready", changes: [] };
    },
    hasRemote: async () => remote,
    addRemote: async (address) => {
      if (remoteFailure !== undefined) throw remoteFailure;
      remotes.push(address);
      remote = true;
    },
    countUnshared: async () => unshared,
    listUnshared: async () => (unshared === 0 ? [] : unsharedIds),
    checkUpdates: async () => {
      checkCalls += 1;
      if (checkFailure !== undefined) throw checkFailure;
      return waiting;
    },
    share: async () => {
      shareCalls += 1;
      await shareGate;
      if (shareFailure !== undefined) throw shareFailure;
      unshared = 0;
    },
    getUpdates: async () => {
      updatesAsked += 1;
      if (updatesFailure !== undefined) throw updatesFailure;
      return updates;
    },
    startMerge: async () => {
      mergeCalls.push("start");
      if (mergeFailure !== undefined) throw mergeFailure;
      if (mergeStart.kind === "started") merge = mergeStart.merge;
      return mergeStart;
    },
    readMerge: async () => merge,
    chooseUpdate: async (path, choice: UpdateChoice, label) => {
      mergeCalls.push(`choose ${path} ${choice} ${label}`);
      if (mergeFailure !== undefined) throw mergeFailure;
      if (merge === null) throw new Error("no merge");
      merge = {
        ...merge,
        items: merge.items.map((item) => (item.path === path ? { ...item, choice } : item)),
      };
    },
    undoUpdateChoice: async (path) => {
      mergeCalls.push(`undo ${path}`);
      if (mergeFailure !== undefined) throw mergeFailure;
      if (merge === null) throw new Error("no merge");
      merge = {
        ...merge,
        items: merge.items.map((item) =>
          item.path === path ? { ...item, choice: undefined, copy: undefined } : item,
        ),
      };
    },
    finishMerge: async (message) => {
      mergeCalls.push(`finish ${message}`);
      if (mergeFailure !== undefined) throw mergeFailure;
      merge = null;
    },
    cancelMerge: async () => {
      mergeCalls.push("cancel");
      if (mergeFailure !== undefined) throw mergeFailure;
      merge = null;
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
    /** What a file is in a version; a file never set isn't in it. */
    setAtVersion: (versionId: string, path: string, text: string) => {
      atVersion.set(`${versionId}:${path}`, text);
    },
    /** Makes reading a file in a version fail with `error`; `undefined` makes it work again. */
    failAtVersion: (error: unknown) => {
      atVersionFailure = error;
    },
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
    /** Who versions are from now; empty texts for a part that isn't set. */
    setIdentity: (next: Identity) => {
      identity = next;
    },
    /** How many times who versions are from was read. */
    identityReads: () => identityReads,
    /** Every identity `setIdentity` was given, in order. */
    identities,
    /** Makes saving who versions are from fail with `error`. */
    failIdentity: (error: unknown) => {
      identityFailure = error;
    },
    /** Every address `addRemote` was given, in order. */
    remotes,
    /** Makes adding a share address fail with `error`; `undefined` makes it work again. */
    failRemote: (error: unknown) => {
      remoteFailure = error;
    },
    /** Whether the folder has a place to get updates from. */
    setRemote: (has: boolean) => {
      remote = has;
    },
    /** How many versions the shared copy lacks, and which of History's versions those are. */
    setUnshared: (count: number, ids: readonly string[] = []) => {
      unshared = count;
      unsharedIds = ids;
    },
    /** How many versions the shared copy has that this workspace lacks, as the next check finds. */
    setWaiting: (count: number) => {
      waiting = count;
    },
    /** Makes the check of the shared copy fail with `error`; `undefined` makes it work again. */
    failCheck: (error: unknown) => {
      checkFailure = error;
    },
    /** How many times the shared copy was asked. */
    checkCalls: () => checkCalls,
    /** Makes Share fail with `error`; `undefined` makes it work again. */
    failShare: (error: unknown) => {
      shareFailure = error;
    },
    /** Makes Share wait until `gate` is settled. */
    holdShare: (gate: Promise<void>) => {
      shareGate = gate;
    },
    /** How many times Share ran. */
    shareCalls: () => shareCalls,
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
    /** What starting a merge finds; a started one stays open until it is finished or cancelled. */
    setMergeStart: (next: MergeStart) => {
      mergeStart = next;
    },
    /** Leaves a merge open, as a window closed half way through one would. */
    setMerge: (next: UpdateMerge | null) => {
      merge = next;
    },
    /** Makes every merge call fail with `error`; `undefined` makes them work again. */
    failMerge: (error: unknown) => {
      mergeFailure = error;
    },
    /** Every merge call, in order, as text such as "choose a.md mine Sam's". */
    mergeCalls,
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
