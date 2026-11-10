// `halonic runs show <run-id>`: what one run did, read from its run log
// (cli-output 3.4, C174 on HAL-2000). A thin command over `RunHistory`, the
// service the Studio's run page reads too: this file finds the run by the id
// the user typed, and turns its summary into the heading. It never prints
// where the run log is (Liam, HAL-1984). The words are the catalogue's
// (`runsMessages`).

import { hubWorkflows, type RunDetail, RunHistory, shortRunId, workflowIn } from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import { loadWorkspace } from "@halonicjs/workspace";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  OwnLineError,
  UsageError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import type { Phrase } from "../../messages/phrase.ts";
import { runsMessages, type ShownEnd } from "../../messages/runs.ts";
import { startedInWords } from "../../messages/runs-list.ts";
import { type RunClock, startedAt } from "../../run-times.ts";
import { givenDir, type OpenWorkspaceDir, openWorkspaceDir } from "../../workspace-dir.ts";
import { openWorkspaceRuns } from "../../workspace-runs.ts";
import type { RunListSetup } from "./list.ts";
import { listedStatus } from "./listed-run.ts";

/**
 * Shows one run, real or test: its heading, then its steps. Exits 0 for any
 * run it finds, failed or not: the command worked, it showed a run. With
 * `--json`, the run's events, oldest first, with full ids.
 *
 * @throws UsageError when there isn't exactly one run id
 * @throws OwnLineError when no run has that id (`not_found`), or two runs end
 *   in that short id (`invalid_input`)
 * @throws NoWorkspaceError when the folder holds no workspace
 */
export async function showRun(
  input: CommandInput,
  context: CommandContext,
  setup: RunListSetup,
): Promise<CommandResult> {
  const typed = oneRunId(input);
  const workspace = await openWorkspaceDir(input, context);
  const history = new RunHistory(await openWorkspaceRuns(workspace.root, setup.profile));
  const lookup = await history.showRun(typed);
  const dir = givenDir(input, workspace);
  switch (lookup.found) {
    case "none":
      throw new OwnLineError(
        "not_found",
        runsMessages.showNoRun(typed, workspace.name),
        runsMessages.showNoRunFix(dir),
      );
    case "several":
      throw new OwnLineError(
        "invalid_input",
        runsMessages.showSeveralRuns(lookup.shortId, workspace.name),
        runsMessages.severalRunsFix(dir),
      );
    case "one": {
      const workflows = hubWorkflows(await loadWorkspace(workspace.store));
      const { summary } = lookup.run;
      const title =
        workflowIn(workflows, summary.hubId, summary.workflowId)?.name ?? summary.workflowId;
      return {
        exitCode: exitCode.ok,
        lines: [heading(lookup.run, title, workspace, setup.clock())],
        json: { events: lookup.run.events },
      };
    }
  }
}

/** The one argument, the run id as typed; else the usage error with the usage line. */
function oneRunId(input: CommandInput): string {
  const [runId, ...more] = input.positionals;
  if (runId === undefined || more.length > 0) {
    throw new UsageError(runsMessages.showTakesOneRunId(input.positionals));
  }
  return runId;
}

/** "Support reply in acme · run 01jd8q · started 14:01, finished 14:02". */
function heading(
  run: RunDetail,
  title: string,
  workspace: OpenWorkspaceDir,
  clock: RunClock,
): Phrase {
  const { summary } = run;
  const started = startedInWords(startedAt(new Date(summary.startedAt), clock));
  return runsMessages.showHeading(
    title,
    workspace.name,
    { id: shortRunId(summary.id), test: summary.kind === "test" },
    started,
    shownEnd(summary, clock),
  ).phrase;
}

/**
 * How the heading ends. A failed run that kept to its budget or was
 * cancelled reads "stopped", as the list's status word does.
 */
function shownEnd(summary: RunSummary, clock: RunClock): ShownEnd {
  const at = (iso: string) => startedInWords(startedAt(new Date(iso), clock));
  switch (summary.status) {
    case "running":
      return { status: "running" };
    case "waiting":
      return { status: "waiting", since: at(summary.lastWaitingAt ?? summary.startedAt) };
    case "completed":
      return { status: "finished", at: at(summary.endedAt ?? summary.updatedAt) };
    case "failed":
      return {
        status: listedStatus(summary) === "stopped" ? "stopped" : "failed",
        at: at(summary.endedAt ?? summary.updatedAt),
      };
  }
}
