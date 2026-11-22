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
    | Exclude<RoutineSkipReason, "target-never-live" | "target-in-trash" | "target-not-found">
    | "target-unavailable";
  /** For `target-unavailable`: why the target can't start. */
  readonly why?: "never-live" | "in-trash" | "not-found";
  /** For `start-refused`: the refusal's sentence, absent when Halonic can't explain it. */
  readonly sentence?: string;
  /** For `start-refused`: the refusal's next step, absent when it has none. */
  readonly fix?: string;
  /** For `start-refused`: set when the next step leads to a command, which a row can't show. */
  readonly toCommand?: true;
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

/** The row's reason for each `why` a target can't start; a row without one reads as never live. */
const unavailableReasons = {
  "never-live": "target-never-live",
  "in-trash": "target-in-trash",
  "not-found": "target-not-found",
} as const satisfies Record<NonNullable<StoredSkip["why"]>, RoutineSkipReason>;

export function skipOf(stored: StoredSkip): RoutineSkip {
  const { from, to, count } = stored;
  if (stored.reason === "target-unavailable") {
    return { reason: unavailableReasons[stored.why ?? "never-live"], from, to, count };
  }
  if (stored.reason === "start-refused" && stored.sentence !== undefined) {
    const { reason, sentence, fix, toCommand } = stored;
    return {
      reason,
      sentence,
      ...(fix === undefined ? {} : { fix }),
      ...(toCommand === undefined ? {} : { toCommand }),
      from,
      to,
      count,
    };
  }
  return { reason: stored.reason, from, to, count };
}

/**
 * The newest due time of a routine when its start was refused: the newest skip row is a refused
 * start, and no run of the routine started after it. `undefined` otherwise, as when a run or
 * another skip came later.
 *
 * @param skips the routine's skip rows, newest first, as the scheduler keeps them
 * @param runs the routine's runs, newest first
 */
export function lastRefusedAt(
  skips: readonly StoredSkip[],
  runs: readonly RunSummary[],
): string | undefined {
  const newest = skips[0];
  if (newest?.reason !== "start-refused") return undefined;
  const lastRun = runs[0];
  if (lastRun !== undefined && Date.parse(lastRun.startedAt) >= Date.parse(newest.to)) {
    return undefined;
  }
  return newest.to;
}

/**
 * Each routine's {@link lastRefusedAt}, in {@link routineFiles}'s order and ready to spread into its listing: `{}` when there is none.
 * A routine whose skips can't be read counts as having none, so one failed read doesn't fail the list.
 */
export function refusedOf(
  workspace: LoadedWorkspace,
  runs: readonly { readonly summary: RunSummary }[],
  skips: ((key: string) => Promise<readonly StoredSkip[]>) | undefined,
): Promise<{ readonly refusedAt?: string }[]> {
  return Promise.all(
    routineFiles(workspace).map(async (file) => {
      const key = routineKeyOf(file);
      const stored = (await skips?.(key).catch(() => [])) ?? [];
      const refusedAt = lastRefusedAt(stored, runsOf(runs, key));
      return refusedAt === undefined ? {} : { refusedAt };
    }),
  );
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

/**
 * What a new routine made from `choice` runs. An agent's prompt is its real task, so an agent with
 * no prompt is refused rather than written with a stand-in.
 */
export function targetWithPrompt(choice: RoutineTargetChoice, prompt: string): RoutineTarget {
  if (choice.kind === "agent" && prompt.trim() === "") {
    throw new KindedError("invalid_input", `Say what ${choice.name} should do.`);
  }
  return targetFor(choice, prompt);
}

export function targetFound(workspace: LoadedWorkspace, target: RoutineTarget): boolean {
  return targetsOf(workspace, target.hubId).some(
    (one) => one.kind === target.kind && one.id === target.id,
  );
}

/**
 * The errors the workspace's checks found in a routine's file, in `halonic validate`'s words. Any
 * one means the routine can't start, as `halonic routines` counts them (HAL-15082).
 *
 * The checks start each message with `Routine "<id>": `. The row already names the routine and cuts
 * its line to one, so the prefix goes and the line starts with the problem; otherwise the fix at the
 * end is what a narrow window cuts off. Each line is a sentence, as the page's other lines are: a
 * capital letter and a full stop. A mail trigger's connector that is gone or isn't Google gets
 * Studio's own sentence, which names where to pick another (C591, HAL-15549).
 */
export function errorsOf(workspace: LoadedWorkspace, file: PlacedFile): readonly string[] {
  return workspace.issues
    .filter((issue) => issue.file === file.path && issue.severity === "error")
    .map((issue) => problemSentence(issue, file));
}

/**
 * The error that its input lacks a field its workflow's first step reads (`missing-routine-input`),
 * worded as {@link errorsOf} words it, so the Starts card can tell it apart from the others
 * (HAL-15721); `undefined` while the input has every such field.
 */
export function inputMissingOf(workspace: LoadedWorkspace, file: PlacedFile): string | undefined {
  const issue = workspace.issues.find(
    (one) => one.file === file.path && one.code === "missing-routine-input",
  );
  return issue === undefined ? undefined : problemSentence(issue, file);
}

/** A check's message as a sentence without its `Routine "<id>": ` prefix (see {@link errorsOf}). */
function problemSentence(issue: LoadedWorkspace["issues"][number], file: PlacedFile): string {
  const studioSentence = mailboxSentence(file, issue.code);
  if (studioSentence !== undefined) return studioSentence;
  const prefix = `Routine "${idOf(file)}": `;
  return asSentence(
    issue.message.startsWith(prefix) ? issue.message.slice(prefix.length) : issue.message,
  );
}

/** The When card picks a mail trigger's connector under Mailbox; microcopy 12.2 calls it an inbox. */
const pickMailbox = "Pick another mailbox under When.";

/** Studio's sentence for a check on a mail trigger's connector, by the check's code. */
function mailboxSentence(file: PlacedFile, code: string): string | undefined {
  const trigger = file.value.trigger;
  if (!("mail" in trigger)) return undefined;
  const connector = trigger.mail.connector;
  if (code === "unknown-connector") return `${connector} isn't in this workspace. ${pickMailbox}`;
  if (code === "not-a-mailbox") {
    return `${connector} isn't a Google connector, so it has no inbox to watch. ${pickMailbox}`;
  }
  return undefined;
}

/** A check's message with a capital first letter and one full stop at the end. */
function asSentence(message: string): string {
  const text = message.trim();
  const capital = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
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

/**
 * A routine in `hub` as one line, for its row and its page: "Weekdays at 07:30 → Briefing". Pass
 * the routine as it runs (`runningOf`), so the line says what really happens.
 */
export function summaryOf(
  workspace: LoadedWorkspace,
  routine: Routine,
  hub: string | null,
): string {
  return `${describeTrigger(routine.trigger)} → ${runTargetName(workspace, routine.run, hub)}`;
}

export function startsOwner(file: PlacedFile, owner: TriggerOwner): boolean {
  const target = targetOfFile(file.value.run, file.hub);
  return target.kind === owner.kind && target.hubId === owner.hubId && target.id === owner.id;
}

/** What a read of a routine the workspace doesn't have rejects with: Studio shows the item-gone state for it. */
export function routineGone(): KindedError {
  return new KindedError("not_found", "This routine isn't in this workspace any more.");
}

/** The routine `ref` names in `workspace`; a routine that is gone throws {@link routineGone}. */
export function findRoutine(workspace: LoadedWorkspace, ref: RoutineRef): PlacedFile {
  const file = routineFiles(workspace).find((one) => one.hub === ref.hubId && idOf(one) === ref.id);
  if (file === undefined) throw routineGone();
  return file;
}
