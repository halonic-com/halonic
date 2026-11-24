// Save… for a file a run created, through the desktop shell (HAL-17832). The page names the run
// and the file's hash; the shell finds the file in that run's log and asks where to save it in
// its own dialog, so no path ever comes from the page.

import type { RunFileSaveHost } from "@halonicjs/studio-feature-runs/api";
import type { TauriIpc } from "@halonicjs/studio-services";

/**
 * The run page's **Save…** for the workspace the window opened at `workspace`, through the
 * shell's `run_file_save`. Rejects with the shell's refusal, or when it answers something else.
 *
 * @example
 * services.provide(RunFileSaveService, shellFileSave(ipc, location));
 */
export function shellFileSave(ipc: TauriIpc, workspace: string): RunFileSaveHost {
  return {
    save: async (runId, hash) => {
      const answer = await ipc.invoke("run_file_save", { workspace, runId, hash });
      const saved = (answer as { saved?: unknown } | null)?.saved;
      if (typeof saved !== "boolean") {
        throw new Error(`The shell answered run_file_save with ${JSON.stringify(answer)}.`);
      }
      return saved ? "saved" : "cancelled";
    },
  };
}
