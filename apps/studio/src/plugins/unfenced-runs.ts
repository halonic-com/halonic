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
 * Take back waits for a yes already sent, so it removes that one too.
 *
 * @example
 * const unfencedRuns = desktopUnfencedRuns(new AgentHostUnfencedRuns(transport));
 * await unfencedRuns.allow("windows"); // null while a Take back is under way
 */
export function desktopUnfencedRuns(routes: UnfencedRunsRoutes): DesktopUnfencedRuns {
  let allowing: Promise<unknown> | undefined;
  let takingBack: Promise<void> | undefined;
  return {
    status: async () => {
      // Waits only for the Take back to end; its failure is Take back's to report.
      await takingBack?.catch(() => undefined);
      return routes.status();
    },
    allow: async (reason) => {
      if (takingBack !== undefined) return null;
      const run = routes.allow(reason);
      allowing = run;
      try {
        return await run;
      } finally {
        if (allowing === run) allowing = undefined;
      }
    },
    takeBack: () => {
      // A yes already on its way is saved first, so the Take back removes it too.
      const before = allowing?.catch(() => undefined);
      const run = (async () => {
        await before;
        await routes.takeBack();
      })().finally(() => {
        if (takingBack === run) takingBack = undefined;
      });
      takingBack = run;
      return run;
    },
  };
}
