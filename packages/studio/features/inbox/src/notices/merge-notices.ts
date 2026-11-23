import type { InboxNotice, InboxNotices } from "./inbox-notices.ts";

/**
 * Two sources of notices as one: the lists joined in {@link newestFirst}'s order, and a dismissal going to the
 * source that holds the notice. With only one source, that one is returned as it is.
 *
 * @example
 * const notices = mergeNotices(workspaceNotices, inbox.extraNotices);
 */
export function mergeNotices(
  first: InboxNotices | undefined,
  second: InboxNotices | undefined,
): InboxNotices | undefined {
  if (first === undefined || second === undefined) return first ?? second;
  return {
    async list() {
      const [one, two] = await Promise.all([first.list(), second.list()]);
      return [...one, ...two].sort(newestFirst);
    },
    subscribe(listener) {
      const stops = [first.subscribe(listener), second.subscribe(listener)];
      return () => {
        for (const stop of stops) stop();
      };
    },
    dismiss(key) {
      // A sandbox notice isn't kept on the device, so its key never reaches the app's dismissals.
      (key.startsWith("sandbox-fixed:") ? second : first).dismiss(key);
    },
  };
}

/**
 * The Inbox's own notices, kept in memory by its sources (the sandbox row's and the on-hold rows'),
 * as one: the lists joined newest first, and a dismissal sent to each, since a source ignores a key
 * it doesn't hold. Every key starts with `sandbox-fixed:`, so {@link mergeNotices} keeps them away
 * from the app's kept dismissals.
 *
 * @example
 * inbox.extraNotices = joinInboxNotices([sandbox.notices, onHold.notices]);
 */
export function joinInboxNotices(sources: readonly InboxNotices[]): InboxNotices | undefined {
  const [only] = sources;
  if (sources.length <= 1) return only;
  return {
    async list() {
      const lists = await Promise.all(sources.map((source) => source.list()));
      return lists.flat().sort(newestFirst);
    },
    subscribe(listener) {
      const stops = sources.map((source) => source.subscribe(listener));
      return () => {
        for (const stop of stops) stop();
      };
    },
    dismiss(key) {
      for (const source of sources) source.dismiss(key);
    },
  };
}

/**
 * Orders notices newest first, after the month's used-up budget, which stops runs from starting
 * and so goes first whatever its time (flow-inbox 4.3).
 */
export function newestFirst(a: InboxNotice, b: InboxNotice): number {
  const stopsStarts = Number(b.kind === "budget-month") - Number(a.kind === "budget-month");
  if (stopsStarts !== 0) return stopsStarts;
  if (a.at === b.at) return 0;
  return a.at < b.at ? 1 : -1;
}
