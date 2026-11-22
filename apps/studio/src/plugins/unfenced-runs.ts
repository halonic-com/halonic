import {
  type AgentHostTransport,
  AgentHostUnfencedRuns,
} from "@halonicjs/adapter-agent-host-client";
import type { RunnerUnfencedReason } from "@halonicjs/app";
import type { PluginUnfencedRuns, UnfencedRunStatus } from "@halonicjs/studio-feature-plugins/api";

/** The agent host's `/v1/unfenced-runs` routes, as `AgentHostUnfencedRuns` calls them. */
export interface UnfencedRunsRoutes {
  status(): Promise<UnfencedRunStatus>;
  allow(
    reason: RunnerUnfencedReason,
  ): Promise<{ readonly reason: string; readonly allowedAt: string } | null>;
  takeBack(): Promise<void>;
}

/** The window's yes to run plugin code without the sandbox: the trust check's and Take back's. */
export interface DesktopUnfencedRuns extends PluginUnfencedRuns {
  /** Takes the yes back and stops every plugin running without the sandbox. */
  readonly takeBack: () => Promise<void>;
}

/**
 * The window's one way to the host's yes (`studio.desktop-unfenced-runs`). A yes sent while a Take
 * back is still under way would save the yes again right after it was removed (Julian, HAL-13786),
 * so while one is, `allow` sends nothing and answers that nothing was saved, and `status` waits
 * for it: the trust check then reads the status as it is after the Take back and asks again. A
 * Take back waits for a yes already sent, so it removes that one too. After a Take back ends, and
 * after a yes is saved, it tells its subscribers, so an open plugin page reads the status again.
 *
 * @example
 * const unfencedRuns = desktopUnfencedRuns(new AgentHostUnfencedRuns(transport));
 * await unfencedRuns.allow("windows"); // null while a Take back is under way
 */
export function desktopUnfencedRuns(routes: UnfencedRunsRoutes): DesktopUnfencedRuns {
  // Every yes on its way, not only the latest: two trust checks may save at once (Liam, HAL-3384).
  const allowing = new Set<Promise<unknown>>();
  let takingBack: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  // A listener only reads the status again; one that throws mustn't stop the others.
  const changed = () => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch {
        // Its view reads the status again the next time it opens.
      }
    }
  };
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    status: async () => {
      // Waits only for the Take back to end; its failure is Take back's to report.
      await takingBack?.catch(() => undefined);
      return routes.status();
    },
    allow: async (reason) => {
      if (takingBack !== undefined) return null;
      const run = routes.allow(reason);
      allowing.add(run);
      try {
        const saved = await run;
        if (saved !== null) changed();
        return saved;
      } finally {
        allowing.delete(run);
      }
    },
    takeBack: () => {
      // Every yes already on its way is saved first, so the Take back removes it too.
      const before = Promise.allSettled([...allowing]);
      const run = (async () => {
        await before;
        await routes.takeBack();
      })().finally(() => {
        if (takingBack === run) takingBack = undefined;
        // Even a refused Take back may have stopped some plugins: views read the status again.
        changed();
      });
      takingBack = run;
      return run;
    },
  };
}

const windows = new WeakMap<object, DesktopUnfencedRuns>();

/**
 * The window's one {@link desktopUnfencedRuns}: the plugin check, Settings › Agent sandbox and the
 * workspace trust check all give and take back the yes through it, so a yes from either check
 * waits for a Take back under way in Settings (HAL-15144). It lives as long as the window.
 */
export function windowUnfencedRuns(
  window: object,
  transport: AgentHostTransport,
): DesktopUnfencedRuns {
  const known = windows.get(window);
  if (known !== undefined) return known;
  const runs = desktopUnfencedRuns(new AgentHostUnfencedRuns(transport));
  windows.set(window, runs);
  return runs;
}
