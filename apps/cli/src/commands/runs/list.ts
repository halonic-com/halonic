// `halonic runs`: the list of a workspace's latest real runs (cli-output 3.4,
// "the list", C174 on HAL-2000). A thin command over `RunHistory`, the
// service the Studio's Runs list reads too: this file reads the options,
// asks the service, and turns its answer into rows. The words are the
// catalogue's (`runsListMessages`, `workflowMessages`).

import {
  defaultRunListLimit,
  type HubWorkflow,
  hubWorkflows,
  lookUpWorkflow,
  RunHistory,
  type RunListFilter,
  workflowIn,
} from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import type { ProfileEnvironment } from "@halonicjs/profile";
import { loadWorkspace } from "@halonicjs/workspace";
import {
  type CommandContext,
  type CommandInput,
  type CommandResult,
  OwnLineError,
  UsageError,
} from "../../command.ts";
import { exitCode } from "../../exit-code.ts";
import { columns } from "../../messages/columns.ts";
import { usageMessages } from "../../messages/general.ts";
import { dimmed, type Phrase, phrase } from "../../messages/phrase.ts";
import {
  type GivenFilters,
  type ListFilters,
  runsListMessages,
  type StatusFilter,
  statusFilters,
  statusYouMeant,
} from "../../messages/runs-list.ts";
import { workflowMessages } from "../../messages/workflow.ts";
import { nearMatch } from "../../near-match.ts";
import type { RunClock } from "../../run-times.ts";
import { givenDir, type OpenWorkspaceDir, openWorkspaceDir } from "../../workspace-dir.ts";
import { openWorkspaceRuns } from "../../workspace-runs.ts";
import { listedRun } from "./listed-run.ts";

/** What the list reads besides the command line, passed in so tests can fix both. */
export interface RunListSetup {
  /** The clock and time zone the When column is written in. */
  clock(): RunClock;
  /** Where the profile folder is, which holds the workspace's runs; this process's by default. */
  readonly profile?: ProfileEnvironment;
}

/** The list's options, read and checked. */
interface ListOptions {
  readonly filters: ListFilters;
  readonly limit: number;
}

/**
 * Lists the newest real runs that match the options, one row each, with a
 * line when `--limit` left runs out. An empty list says why, and exits 0.
 *
 * @throws UsageError when `--status` or `--limit` is wrong
 * @throws OwnLineError when `--workflow` names no workflow, or one in several hubs
 * @throws NoWorkspaceError when the folder holds no workspace
 */
export async function listRuns(
  input: CommandInput,
  context: CommandContext,
  setup: RunListSetup,
): Promise<CommandResult> {
  const options = listOptions(input);
  const workspace = await openWorkspaceDir(input, context);
  const workflows = hubWorkflows(await loadWorkspace(workspace.store));
  const history = new RunHistory(await openWorkspaceRuns(workspace.root, setup.profile));
  const filter = await runFilter(options.filters, workflows, history, workspace);
  const list = await history.listRuns(filter, options.limit);
  const json = { runs: list.runs, total: list.total };
  const dir = givenDir(input, workspace);
  if (list.runs.length === 0) {
    const lines = await emptyListLines(options.filters, history, workspace, dir);
    return { exitCode: exitCode.ok, lines, json };
  }
  const rows = await runRows(list.runs, workflows, history, setup.clock());
  const lines = [...columns(rows)];
  if (list.total > list.runs.length) {
    lines.push(runsListMessages.leftOut(list.runs.length, list.total, options.filters, dir).phrase);
  }
  return { exitCode: exitCode.ok, lines, json };
}

function listOptions(input: CommandInput): ListOptions {
  const status = input.options["status"];
  const workflow = input.options["workflow"];
  const limit = input.options["limit"];
  return {
    filters: {
      ...(typeof status === "string" ? { status: statusFilter(status) } : {}),
      ...(typeof workflow === "string" ? { workflow } : {}),
    },
    limit: typeof limit === "string" ? wholeLimit(limit) : defaultRunListLimit,
  };
}

/** `--status` as one of the four, or the usage error with "Did you mean" (cli-output 3.4). */
function statusFilter(given: string): StatusFilter {
  const status = statusFilters.find((each) => each === given);
  if (status !== undefined) {
    return status;
  }
  const near = statusYouMeant(given);
  throw new UsageError(
    runsListMessages.statusNotOneOf(given),
    near === undefined
      ? usageMessages.seeCommandOptions("runs")
      : runsListMessages.statusNear(near),
  );
}

/** `--limit` as a whole number of 1 or more; otherwise the usage error, with the usage line as its fix. */
function wholeLimit(given: string): number {
  const limit = /^\d+$/.test(given) ? Number(given) : Number.NaN;
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new UsageError(runsListMessages.limitNotWhole(given));
  }
  return limit;
}

/**
 * The service's filter for the user's options. `--workflow` names a
 * workflow by its id, or as `hub/id`; a workflow that's gone but still has
 * runs is listed by its id (cli-output 3.4, the list's errors).
 */
async function runFilter(
  filters: ListFilters,
  workflows: readonly HubWorkflow[],
  history: RunHistory,
  workspace: OpenWorkspaceDir,
): Promise<RunListFilter> {
  const byStatus = filters.status === undefined ? {} : { status: filters.status };
  if (filters.workflow === undefined) {
    return byStatus;
  }
  const typed = filters.workflow;
  const lookup = lookUpWorkflow(workflows, typed);
  switch (lookup.found) {
    case "one":
      return { ...byStatus, hubId: lookup.hubId, workflowId: lookup.workflow.id };
    case "several":
      throw new OwnLineError(
        "invalid_input",
        workflowMessages.inSeveralHubs(typed, lookup.hubIds.length),
        workflowMessages.nameTheHub(lookup.hubIds.map((hubId) => `${hubId}/${typed}`)),
      );
    case "none": {
      const gone = goneWorkflow(typed);
      if ((await history.listRuns(gone, 1)).total > 0) {
        return { ...byStatus, ...gone };
      }
      const near = nearMatch(
        typed,
        workflows.map((each) => each.workflow.id),
      );
      throw new OwnLineError(
        "not_found",
        workflowMessages.noWorkflow(typed, workspace.name),
        near === undefined ? workflowMessages.seeWorkflows() : workflowMessages.workflowNear(near),
      );
    }
  }
}

/** The filter for a workflow no hub has any more: by its id, and by its hub when the user named one. */
function goneWorkflow(typed: string): RunListFilter {
  const slash = typed.indexOf("/");
  return slash === -1
    ? { workflowId: typed }
    : { hubId: typed.slice(0, slash), workflowId: typed.slice(slash + 1) };
}

/**
 * Why the list is empty: no real runs at all (or only test runs), whatever
 * the filters; else the filters match nothing, with the way to see every run.
 */
async function emptyListLines(
  filters: ListFilters,
  history: RunHistory,
  workspace: OpenWorkspaceDir,
  dir: string | undefined,
): Promise<Phrase[]> {
  const given = givenFilters(filters);
  if (given !== undefined && (await history.listRuns({}, 1)).total > 0) {
    return [
      runsListMessages.noMatch(given, workspace.name).phrase,
      phrase`  ${runsListMessages.seeEveryRun(dir).phrase}`,
    ];
  }
  const line = (await history.hasTestRuns())
    ? runsListMessages.onlyTestRuns(workspace.name, dir)
    : runsListMessages.noRunsYet(workspace.name, dir);
  return [line.phrase];
}

function givenFilters(filters: ListFilters): GivenFilters | undefined {
  if (filters.status !== undefined) {
    return { ...filters, status: filters.status };
  }
  if (filters.workflow !== undefined) {
    return { ...filters, workflow: filters.workflow };
  }
  return undefined;
}

/** One row of five cells per run: status, short id, workflow, What, and When dimmed. */
async function runRows(
  runs: readonly RunSummary[],
  workflows: readonly HubWorkflow[],
  history: RunHistory,
  clock: RunClock,
): Promise<Phrase[][]> {
  const findWorkflow = (hubId: string, workflowId: string) =>
    workflowIn(workflows, hubId, workflowId);
  return Promise.all(
    runs.map(async (summary) => {
      // Only a finished run's What column asks; the others skip reading the log.
      const madeToolCalls =
        summary.status === "completed" ? await history.madeToolCalls(summary.id) : false;
      const row = listedRun({ summary, madeToolCalls }, findWorkflow, clock);
      return [
        runsListMessages.status(row.status).phrase,
        phrase`${row.runId}`,
        phrase`${row.workflow}`,
        row.what,
        dimmed(row.when),
      ];
    }),
  );
}
