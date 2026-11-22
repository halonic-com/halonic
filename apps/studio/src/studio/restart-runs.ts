import type { ServiceRegistry } from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import { AGENT_HARNESSES } from "@halonicjs/format";
import type { RestartRuns, RestartRunsHost } from "@halonicjs/studio-feature-settings/api";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
import { engineServiceKey } from "../engine/engine-service.ts";

/** The runs the window's engine hasn't ended, and the workspace it loaded; none while it isn't open. */
export interface WindowRuns {
  openRuns(): Promise<
    { readonly runs: readonly RunSummary[]; readonly workspace: LoadedWorkspace } | undefined
  >;
}

/** No run: what the window reports while no engine of its own is open. */
const none: RestartRuns = { running: 0, waitingForYou: 0 };

/**
 * The runs a restart ends, for the restart dialog: those of the engine this window runs in its
 * page (HAL-10236), read when the dialog asks. Runs that `halonic run` or another window started
 * live in other processes and aren't counted. Reads the folder's engine from `services` at that
 * moment, since the engine is provided after the restart dialog's service.
 */
export function restartRunsOfWindow(services: ServiceRegistry): RestartRunsHost {
  return {
    count: () =>
      services.has(engineServiceKey)
        ? countRestartRuns(services.get(engineServiceKey))
        : Promise.resolve(none),
  };
}

/**
 * Counts as the restart dialog does: a run with a step in progress, and a run waiting for a
 * person's OK to a Claude Code or Codex call, whose program is still running. A run that waits
 * for an answer otherwise comes back from its run log, so it isn't counted.
 */
export async function countRestartRuns(engine: WindowRuns): Promise<RestartRuns> {
  const open = await engine.openRuns();
  if (open === undefined) return none;
  const inProgram = programAgentsOf(open.workspace);
  const running = open.runs.filter((run) => run.status === "running").length;
  const waitingForYou = open.runs.filter(
    (run) =>
      run.status === "waiting" && run.approvals.some((approval) => inProgram.has(approval.agent)),
  ).length;
  return { running: running + waitingForYou, waitingForYou };
}

/** The ids of the workspace's agents that run in a program such as Claude Code or Codex. */
function programAgentsOf(workspace: LoadedWorkspace): ReadonlySet<string> {
  const ids = filesOf(workspace, "agent")
    .filter(({ value }) => value.harness !== undefined && value.harness !== "halonic")
    .filter(({ value }) => AGENT_HARNESSES.includes(value.harness ?? ""))
    .map(({ value }) => value.id);
  return new Set(ids);
}
