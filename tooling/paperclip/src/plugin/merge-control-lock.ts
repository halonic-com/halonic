import type { PluginStateClient, ScopeKey } from "@paperclipai/plugin-sdk";

/**
 * The pass lock (HAL-17884): merge control's state is written only while
 * the company's pass lock is held. On the Merger a board edit of
 * `state.json` raced a live pass and the pass wrote over it; here a pass
 * and a board edit each take the lock, read, change and write, one after
 * the other. One lock per worker, made by `passLock`, never module memory.
 */

/** Merge control's namespace in plugin state. */
export const mergeControlNamespace = "merge-control";

/** Where a company's merge-control pass keeps its state; the PR watcher reads it too (HAL-18147). */
export function passStateKey(companyId: string) {
  return {
    scopeKind: "company",
    scopeId: companyId,
    namespace: mergeControlNamespace,
    stateKey: "pass",
  } as const;
}

/** The state client calls merge control uses. */
export type MergeStateClient = Pick<PluginStateClient, "get" | "set">;

/** Holds the pass lock per company. */
export interface PassLock {
  /**
   * Plugin state where merge control's entries can't be written: every
   * write to them goes through `run`. Other namespaces pass through.
   */
  readonly state: MergeStateClient;
  /**
   * Runs `work` with the company's lock held; another caller waits until
   * it ends. `work`'s client writes the company's merge-control entries
   * only until `work` returns.
   */
  run<T>(companyId: string, work: (state: MergeStateClient) => Promise<T>): Promise<T>;
}

function refused(): Error {
  return new Error("Merge control: its state is written only under the pass lock.");
}

function isMergeControl(key: ScopeKey): boolean {
  return key.namespace === mergeControlNamespace;
}

/** A pass lock over `state`, for one worker. */
export function passLock(state: MergeStateClient): PassLock {
  // The end of the last holder's turn, per company.
  const turns = new Map<string, Promise<void>>();
  const guarded: MergeStateClient = {
    get: (key) => state.get(key),
    set: async (key, value) => {
      if (isMergeControl(key)) {
        throw refused();
      }
      await state.set(key, value);
    },
  };
  return {
    state: guarded,
    async run(companyId, work) {
      const before = turns.get(companyId) ?? Promise.resolve();
      let release = () => {};
      const mine = new Promise<void>((resolve) => {
        release = resolve;
      });
      turns.set(
        companyId,
        before.then(() => mine),
      );
      // A failed holder still releases, so `before` never rejects.
      await before;
      let held = true;
      const client: MergeStateClient = {
        get: (key) => state.get(key),
        set: async (key, value) => {
          if (isMergeControl(key) && (!held || key.scopeId !== companyId)) {
            throw refused();
          }
          await state.set(key, value);
        },
      };
      try {
        return await work(client);
      } finally {
        held = false;
        release();
      }
    },
  };
}
