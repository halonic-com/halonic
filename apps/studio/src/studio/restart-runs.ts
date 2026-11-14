import type { RestartRunsHost } from "@halonicjs/studio-feature-settings/api";

/**
 * The runs a restart ends, for the restart dialog. The window doesn't start a run or an agent
 * session yet (`studio.workspace-runs`), so a restart stops none: runs that `halonic run` or the
 * agent host's own programs started live in other processes. When the window starts runs, this
 * is where they are counted, and the dialog begins to appear with no other change.
 */
export const restartRunsOfWindow: RestartRunsHost = {
  count: async () => ({ running: 0, waitingForYou: 0 }),
};
