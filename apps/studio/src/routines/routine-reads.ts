import { startsAProgram, workflowAgentsOf } from "@halonicjs/adapter-workspace-models";
import type { RunSummary } from "@halonicjs/events";
import type { Routine } from "@halonicjs/format";
import { describeTrigger, routineKey } from "@halonicjs/routines";
import { KindedError } from "@halonicjs/std";
import type {
  RoutineMailbox,
  RoutineRef,
  RoutineRun,
  RoutineSkip,
  RoutineSkipReason,
  RoutineTarget,
  RoutineTargetChoice,
  TriggerOwner,
} from "@halonicjs/studio-feature-routines/api";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
import { targetOfFile } from "./routine-files.ts";

/** A due time the scheduler dropped, as the host's `skips` part hands it over. */
export interface StoredSkip {
  readonly reason:
    | Exclude<RoutineSkipReason, "target-never-live" | "target-in-trash">
    | "target-unavailable";
  /** For `target-unavailable`: why the target can't start. */
  readonly why?: "never-live" | "in-trash";
  readonly from: string;
  readonly to: string;
  readonly count: number;
}

export type PlacedFile = ReturnType<typeof routineFiles>[number];

/** The routine files of a loaded workspace, with the hub each sits in (`null` at the root). */
export function routineFiles(workspace: LoadedWorkspace) {
  return filesOf(workspace, "routine");
}

export const nameKey = ({ hubId, id }: RoutineRef): string => `${hubId ?? ""}/${id}`;

/** The id of a routine file: its file's name without the suffix. */
export const idOf = (file: PlacedFile): string => file.value.id;

export const routineKeyOf = (file: PlacedFile): string =>
  routineKey({ hub: file.hub, routine: file.value });

/** The real runs a routine started, newest first as the run store lists them. */
export function runsOf(
  runs: readonly { readonly summary: RunSummary }[],
  key: string,
): RunSummary[] {
  return runs
    .map(({ summary }) => summary)
    .filter((summary) => summary.kind === "run" && summary.trigger?.routineId === key)
    .sort((first, second) => second.startedAt.localeCompare(first.startedAt));
}

export function startedByOf(summary: RunSummary): RoutineRun["startedBy"] {
  const type = summary.trigger?.type;
  // An Inbox request never names a routine, so its run isn't one of a routine's; read it as Run now.
  return type === undefined || type === "manual" || type === "inbox" ? "run-now" : type;
}

export function skipOf(stored: StoredSkip): RoutineSkip {
  const { from, to, count } = stored;
  if (stored.reason === "target-unavailable") {
    return {
      reason: stored.why === "in-trash" ? "target-in-trash" : "target-never-live",
      from,
      to,
      count,
    };
  }
  return { reason: stored.reason, from, to, count };
}

/** The workflows of a hub, then its agents, each in the hub's order, that a routine of the hub can start. */
export function targetsOf(workspace: LoadedWorkspace, hubId: string | null): RoutineTargetChoice[] {
  const inHub = (file: { readonly hub: string | null }) => file.hub === hubId && hubId !== null;
  return [
    ...filesOf(workspace, "workflow")
      .filter(inHub)
      .map((file) => ({
        kind: "workflow" as const,
        hubId: file.hub as string,
        id: file.value.id,
        name: file.value.name,
        start: file.value.start && { label: file.value.start.label, field: file.value.start.field },
      })),
    ...filesOf(workspace, "agent")
      .filter(inHub)
      .map((file) => ({
        kind: "agent" as const,
        hubId: file.hub as string,
        id: file.value.id,
        name: file.value.name,
      })),
  ];
}

/** The Google connectors a routine of the hub can watch for mail: the hub's own first, then the shared ones at the root. */
export function mailboxesOf(workspace: LoadedWorkspace, hubId: string | null): RoutineMailbox[] {
  const connectors = filesOf(workspace, "connector");
  const own = connectors.filter((file) => file.hub === hubId);
  const shared = hubId === null ? [] : connectors.filter((file) => file.hub === null);
  return [...own, ...shared].flatMap((file) =>
    "google" in file.value.transport
      ? [
          {
            connector: file.value.id,
            name: file.value.name ?? file.value.id,
            account: file.value.transport.google.account,
          },
        ]
      : [],
  );
}

/** What a routine made from `choice` runs: a workflow with no input, or an agent with `prompt`. */
export function targetFor(choice: RoutineTargetChoice, prompt: string): RoutineTarget {
  return choice.kind === "workflow"
    ? { kind: "workflow", hubId: choice.hubId, id: choice.id, input: "{}" }
    : { kind: "agent", hubId: choice.hubId, id: choice.id, prompt };
}

export function targetFound(workspace: LoadedWorkspace, target: RoutineTarget): boolean {
  return targetsOf(workspace, target.hubId).some(
    (one) => one.kind === target.kind && one.id === target.id,
  );
}

/**
 * Whether what a routine starts runs an agent in a program of its own (Claude Code or Codex), which
 * needs the sandbox: any agent of the workflow and the workflows it starts.
 *
 * An agent on its own is never counted while agent runs aren't built (HAL-14848): Run now refuses
 * it with `agentCantRunWords` whatever its harness, so asking for the sandbox first would send the
 * person to fix the sandbox for a routine that still can't run.
 */
export function targetStartsProgram(workspace: LoadedWorkspace, target: RoutineTarget): boolean {
  if (target.kind === "agent") return false;
  const agents = workflowAgentsOf(workspace, { hubId: target.hubId, workflowId: target.id });
  return agents.some((agent) => startsAProgram(agent.value.harness));
}

/** The name of what a routine starts, for the row's summary; its id when the file is missing. */
export function targetName(workspace: LoadedWorkspace, file: PlacedFile): string {
  return runTargetName(workspace, file.value.run, file.hub);
}

/** The name of what a routine's `run` starts, from the routine's hub; its id when the file is missing. */
export function runTargetName(
  workspace: LoadedWorkspace,
  run: Routine["run"],
  routineHub: string | null,
): string {
  const target = targetOfFile(run, routineHub);
  return (
    targetsOf(workspace, target.hubId).find(
      (one) => one.kind === target.kind && one.id === target.id,
    )?.name ?? target.id
  );
}

/** The routine as one line, for its row and its page: "Weekdays at 07:30 → Briefing". */
export function summaryOf(workspace: LoadedWorkspace, file: PlacedFile): string {
  return `${describeTrigger(file.value.trigger)} → ${targetName(workspace, file)}`;
}

export function startsOwner(file: PlacedFile, owner: TriggerOwner): boolean {
  const target = targetOfFile(file.value.run, file.hub);
  return target.kind === owner.kind && target.hubId === owner.hubId && target.id === owner.id;
}

/** What a read of a routine the workspace doesn't have rejects with: Studio shows the item-gone state for it. */
export function routineGone(): KindedError {
  return new KindedError("not_found", "This routine isn't in this workspace any more.");
}
