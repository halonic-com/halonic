import type { InboxSetupSource, SetupEntry } from "./inbox.ts";

/** A setup source whose accounts and failures a test sets, telling the Inbox as a provider does. */
export function fakeSetups(provider: string, initial: readonly SetupEntry[]) {
  let entries = initial;
  let failure: unknown;
  const listeners = new Set<() => void>();
  const source: InboxSetupSource = {
    provider,
    list: async () => {
      if (failure !== undefined) throw failure;
      return entries;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    source,
    listeners,
    fail: (error: unknown) => {
      failure = error;
    },
    answer: () => {
      failure = undefined;
    },
    change: (next: readonly SetupEntry[]) => {
      entries = next;
      for (const listener of [...listeners]) listener();
    },
  };
}

/** The Google setup of `x@example.com` at step 4, changed at `changedAt`. */
export function setupEntry(account: string, changedAt: string, fields: Partial<SetupEntry> = {}) {
  return {
    account,
    title: "Set up Google for x@example.com",
    progress: "Step 4 of 7 · Scopes",
    changedAt,
    ...fields,
  } satisfies SetupEntry;
}
