import { type CopyAgent, copyTaskOf } from "../pr-tools/approval-copy.ts";
import { branchOwner } from "../pr-watcher/decide.ts";
import { routineRefusal } from "../reviewer-paths.ts";
import { pathReviewer } from "../reviewer-paths-who.ts";
import type { RecordedGate } from "../verdicts/gate.ts";
import { recordedGateOf } from "../verdicts/gate-read.ts";
import { type ImportComment, importDrafts } from "../verdicts/import.ts";
import type { VerdictPull } from "../verdicts/reader.ts";
import type { VerdictDraft, VerdictRecord } from "../verdicts/record.ts";
import { approvalOf, routedOf } from "./approval.ts";
import { gateVerdictPullOf } from "./approval-side.ts";
import { changeRequestOf } from "./change-request.ts";
import type { GatePull, MergeSnapshot } from "./snapshot.ts";

/**
 * Shadow mode for the recorded verdicts (HAL-19481, step 2 of 2.4 in
 * HAL-19228): the records as the gate reads them once the board's flag is on
 * (`recordedGateOf`, HAL-19969) next to its approval rules on GitHub text (`approvalOf` and
 * `changeRequestOf`). Each pull request is checked on a new head and every
 * 15 minutes after; before the records are read, the approvals' Paperclip
 * copies not imported yet become records (`importDrafts`, step 1). The
 * daily diff lists each pull request where the two disagree. Nothing is
 * refused here.
 */

/** What the records say about a pull request's current head. */
export type RecordedState = "approved" | "not approved" | "unknown";

/** One pull request's comparison on its current head, kept for the day. */
export interface VerdictCheck {
  readonly head: string;
  /** The first check this day of this head. */
  readonly since: string;
  readonly checkedAt: string;
  /** The gate's approval rules on GitHub text pass. */
  readonly gate: boolean;
  /** Why they don't, when they don't. */
  readonly gateWhy?: string;
  readonly recorded: RecordedState;
  /** Who approved, or why the records don't approve. */
  readonly recordedWhy?: string;
  /** Records imported from Paperclip copies this day. */
  readonly imported?: number;
}

/** The day's comparisons, by pull request number. */
export type VerdictChecks = Readonly<Record<string, VerdictCheck>>;

/** How the comparison reads and writes Paperclip; the plugin implements it. */
export interface VerdictShadowReader {
  /** The agent id of each reviewer the settings name (`verdictReviewers`), by lower-case name. */
  readonly reviewerIds: Readonly<Record<string, string>>;
  /** The pull request's records, oldest first. */
  records(pr: number): Promise<readonly VerdictRecord[]>;
  append(draft: VerdictDraft): Promise<VerdictRecord>;
  /** The comments on the task with this identifier, or none when there is no such task. */
  taskComments(identifier: string): Promise<readonly ImportComment[]>;
  agents(): Promise<readonly CopyAgent[]>;
}

/** The pull requests' repository and the account every agent pushes as. */
export interface VerdictShadowSettings {
  readonly repo: string;
  readonly teamLogin: string;
}

/** The same 15 minutes as the copies' check: a reviewer records a verdict after the GitHub line. */
const recheckMs = 15 * 60_000;

/**
 * What the import needs about the pull request, from the snapshot, routed
 * as the gate routes it (`routedOf`: a security or release origin, renamed
 * files' old paths, who wrote it). When the snapshot lists only some files,
 * there is no reviewer and Nora's approval can't count, as in the gate. The
 * fingerprint is the one the gate reads (`readPatchIds`): only a pull
 * request whose GitHub line names another head has one.
 */
export function verdictPullOf(
  pull: GatePull,
  patchIds: Readonly<Record<string, string | null>>,
): VerdictPull {
  const all = pull.filesTotal <= pull.files.length;
  const routed = routedOf(pull);
  return {
    head: pull.head,
    author: pull.crossRepository ? undefined : branchOwner(pull.branch),
    reviewer: all ? pathReviewer(routed) : undefined,
    routineRefusal: all ? routineRefusal(routed) : `${pull.filesTotal} files (can't check all)`,
    fingerprint: patchIds[pull.head] ?? null,
  };
}

/** Whether the gate's approval rules pass on the current head, and why not. */
export function gateApproves(
  pull: GatePull,
  teamLogin: string,
  patchIds: Readonly<Record<string, string | null>>,
): { readonly approves: boolean; readonly why?: string } {
  const result = approvalOf(pull, teamLogin, patchIds);
  const request = changeRequestOf(pull, teamLogin, result.approval);
  if (request !== null) {
    return { approves: false, why: `changes requested by ${request.who}` };
  }
  const [why] = result.reasons;
  return why === undefined ? { approves: true } : { approves: false, why };
}

/** What the records say, in the diff's words. */
export function recordedOf(gate: RecordedGate): Pick<VerdictCheck, "recorded" | "recordedWhy"> {
  const counting = gate.approvals.find((approval) => approval.counts);
  if (gate.approved && counting !== undefined) {
    const carried =
      counting.carriedFrom === undefined
        ? ""
        : ` (same change as ${counting.carriedFrom.slice(0, 9)})`;
    return { recorded: "approved", recordedWhy: `${counting.by}${carried}` };
  }
  const [hold] = gate.holds;
  if (hold !== undefined) {
    return { recorded: "not approved", recordedWhy: `changes requested by ${hold.by}` };
  }
  return { recorded: "not approved", recordedWhy: gate.reasons[0] ?? "no recorded approval" };
}

/**
 * The pull requests to check this pass: a head not checked yet today, or
 * one checked 15 minutes ago or more.
 */
export function verdictChecksDue(
  snapshot: MergeSnapshot,
  before: VerdictChecks | undefined,
  now: Date,
): GatePull[] {
  return snapshot.pulls.filter((pull) => {
    const check = before?.[String(pull.number)];
    return (
      check === undefined ||
      check.head !== pull.head ||
      now.getTime() - Date.parse(check.checkedAt) >= recheckMs
    );
  });
}

/** The records the pull request's Paperclip copies add, once the gate passes on a GitHub line. */
async function imported(
  pull: GatePull,
  facts: VerdictPull,
  records: readonly VerdictRecord[],
  reader: VerdictShadowReader,
  settings: VerdictShadowSettings,
): Promise<VerdictRecord[]> {
  const task = pull.crossRepository ? undefined : copyTaskOf(pull.branch);
  if (task === undefined || Object.keys(reader.reviewerIds).length === 0) {
    return [];
  }
  const [comments, agents] = await Promise.all([reader.taskComments(task), reader.agents()]);
  const drafts = importDrafts({
    repo: settings.repo,
    pr: pull.number,
    head: pull.head,
    branch: pull.branch,
    ownBranch: !pull.crossRepository,
    openedBy: pull.author ?? "",
    teamLogin: settings.teamLogin,
    reviewer: facts.reviewer,
    routineRefusal: facts.routineRefusal,
    fingerprint: facts.fingerprint,
    reviewerIds: reader.reviewerIds,
    agents,
    comments,
    records,
  });
  const added: VerdictRecord[] = [];
  for (const draft of drafts) {
    added.push(await reader.append(draft));
  }
  return added;
}

/** One pull request's comparison; a failed read or import leaves the records `unknown`. */
async function checkOne(
  snapshot: MergeSnapshot,
  pull: GatePull,
  reader: VerdictShadowReader,
  settings: VerdictShadowSettings,
): Promise<Omit<VerdictCheck, "since" | "checkedAt">> {
  const gate = gateApproves(pull, settings.teamLogin, snapshot.patchIds);
  const gateSide = {
    gate: gate.approves,
    ...(gate.why === undefined ? {} : { gateWhy: gate.why }),
  };
  const facts = verdictPullOf(pull, snapshot.patchIds);
  try {
    const records = await reader.records(pull.number);
    const added = gate.approves ? await imported(pull, facts, records, reader, settings) : [];
    const recordedGate = await recordedGateOf(
      {
        // The records just read, with this pass's imports: no second read.
        store: { list: async () => [...records, ...added], append: reader.append },
        teamLogin: settings.teamLogin,
        taskComments: (identifier) => reader.taskComments(identifier),
        agents: () => reader.agents(),
      },
      gateVerdictPullOf(pull, settings.repo, snapshot.patchIds),
    );
    const recorded = recordedOf(recordedGate);
    return {
      head: pull.head,
      ...gateSide,
      ...recorded,
      ...(added.length === 0 ? {} : { imported: added.length }),
    };
  } catch (error) {
    return {
      head: pull.head,
      ...gateSide,
      recorded: "unknown",
      recordedWhy: `the records couldn't be read: ${(error as Error).message}`,
    };
  }
}

/**
 * The day's comparisons after this pass: the due pull requests checked, the
 * others kept. A head checked before keeps the time it was first checked.
 */
export async function checkVerdicts(
  snapshot: MergeSnapshot,
  before: VerdictChecks | undefined,
  reader: VerdictShadowReader,
  settings: VerdictShadowSettings,
  now: Date,
): Promise<VerdictChecks> {
  const checks: Record<string, VerdictCheck> = { ...before };
  const at = now.toISOString();
  for (const pull of verdictChecksDue(snapshot, before, now)) {
    const checked = await checkOne(snapshot, pull, reader, settings);
    const earlier = checks[String(pull.number)];
    const since = earlier?.head === checked.head ? earlier.since : at;
    const count = (earlier?.imported ?? 0) + (checked.imported ?? 0);
    checks[String(pull.number)] = {
      ...checked,
      since,
      checkedAt: at,
      ...(count === 0 ? {} : { imported: count }),
    };
  }
  return checks;
}

/** One line of the diff's list: a pull request where the records and the gate disagree. */
export interface VerdictDiffLine {
  readonly key: string;
  readonly at: string;
  readonly reason: string;
}

function sideText(approves: boolean, why: string | undefined): string {
  const word = approves ? "approved" : "not approved";
  return why === undefined ? word : `${word}, ${why}`;
}

/** The pull requests whose newest check disagrees, as the diff lists them. */
export function verdictDiffLines(checks: VerdictChecks | undefined): VerdictDiffLine[] {
  return Object.entries(checks ?? {})
    .filter(([, check]) => check.gate !== (check.recorded === "approved"))
    .map(([number, check]) => {
      const records =
        check.recorded === "approved"
          ? sideText(true, check.recordedWhy)
          : `${check.recorded}${check.recordedWhy === undefined ? "" : `, ${check.recordedWhy}`}`;
      return {
        key: `#${number} on ${check.head.slice(0, 9)}`,
        at: check.since,
        reason: `gate: ${sideText(check.gate, check.gateWhy)}; records: ${records}`,
      };
    });
}

/** How many records the day imported from Paperclip copies. */
export function importedToday(checks: VerdictChecks | undefined): number {
  return Object.values(checks ?? {}).reduce((sum, check) => sum + (check.imported ?? 0), 0);
}
