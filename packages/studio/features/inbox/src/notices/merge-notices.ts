import type { InboxNotice, InboxNotices } from "./inbox-notices.ts";

/**
 * Two sources of notices as one: the lists joined, newest first, and a dismissal going to the
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

function newestFirst(a: InboxNotice, b: InboxNotice): number {
  if (a.at === b.at) return 0;
  return a.at < b.at ? 1 : -1;
}
