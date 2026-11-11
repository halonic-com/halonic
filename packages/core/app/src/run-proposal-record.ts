// The record the run proposal service keeps for each run with a worktree,
// or with history off a copy (HAL-3248): while it runs, where its folder
// is; once it has proposed, the proposal and each file's decision. Kept as
// JSON in a store of its own, like the review records (HAL-3417), so git
// can never bring one in.

import { checkCommitId, checkProposalRef } from "@halonicjs/ports";
import { err, isPlainObject, ok, type Result } from "@halonicjs/std";
import type {
  Decision,
  FileBase,
  HistoryOffProposal,
  HistoryOnProposal,
  ProposedFile,
  RunProposal,
} from "./run-proposal-types.ts";

/** The version of the record's JSON. A record of another version counts as unreadable. */
const recordFormat = 1;

/** A run that is still running, in its worktree. */
export interface HistoryOnRunningRecord {
  readonly state: "running";
  readonly history: "git";
  readonly runId: string;
  /** The commit the worktree was added at. */
  readonly base: string;
  readonly worktreeId: string;
}

/** A run that is still running, in its copy of the workspace: the copy is named by the run's id. */
export interface HistoryOffRunningRecord {
  readonly state: "running";
  readonly history: "off";
  readonly runId: string;
}

/**
 * A run that is still running. A record written before history off existed
 * has no `history`, and reads as `"git"`.
 */
export type RunningRecord = HistoryOnRunningRecord | HistoryOffRunningRecord;

/** A run that ended with changes, and what the person decided so far. */
export interface ProposedRecord {
  readonly state: "proposed";
  readonly proposal: RunProposal;
  /** When the run ended, as an ISO date, for the ref's 30 days. */
  readonly finishedAt: string;
  /** One decision per proposed file, by path. */
  readonly decisions: Readonly<Record<string, Decision>>;
  /**
   * The undecided files of which the person decided some parts or
   * changes, by path. Absent when there are none.
   */
  readonly partly?: Readonly<Record<string, PartlyDecided>>;
  /**
   * Set once the proposal is settled (`app.run-proposal-done`): its ref is
   * gone and nothing more can be decided. Absent while it is open.
   */
  readonly settled?: Settled;
}

/** When and why a proposal was settled. */
export interface Settled {
  /** As an ISO date. */
  readonly at: string;
  /**
   * `decided`: no file was left to decide once the person could no longer
   * undo. `expired`: 30 days after the run finished; files still undecided
   * then were not reviewed. `unavailable`: the person removed it because its
   * ref was gone (`app.run-proposal-unavailable`); files still undecided
   * then were not reviewed.
   */
  readonly why: "decided" | "expired" | "unavailable";
}

/** Where a file stands once some of its parts or changes are decided. */
export interface PartlyDecided {
  /** The digest of the saved file as the last accepted part left it: what the next write expects. */
  readonly saved: `sha256:${string}`;
  /** The run's text, less the parts and changes the person rejected. */
  readonly run: string;
}

/** The record of one run. */
export type RunProposalRecord = RunningRecord | ProposedRecord;

/** Where the proposal ref of a run lives. */
export function proposalRefOf(runId: string): string {
  const ref = `refs/halonic/proposals/${runId}`;
  checkProposalRef(ref);
  return ref;
}

/**
 * The name of a run's record in the records' store. A run id is a proposal
 * ref's id, so it is a safe file name.
 *
 * @throws RangeError for a run id that can't be a proposal ref's id
 */
export function recordPathOf(runId: string): string {
  proposalRefOf(runId);
  return `${runId}.json`;
}

/** A record as JSON, the way {@link parseRunProposalRecord} reads it back. */
export function serializeRunProposalRecord(record: RunProposalRecord): string {
  return `${JSON.stringify({ format: recordFormat, ...record }, null, 2)}\n`;
}

/**
 * Reads a record that {@link serializeRunProposalRecord} wrote, checking
 * every field, because a person or a sync tool may have changed the file.
 *
 * @param runId - the run the record's name says it is about
 * @returns the record, or what is wrong with it
 */
export function parseRunProposalRecord(
  text: string,
  runId: string,
): Result<RunProposalRecord, string> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return err("it isn't valid JSON");
  }
  if (!isPlainObject(json) || json["format"] !== recordFormat) {
    return err(`it isn't a JSON object of format ${recordFormat}`);
  }
  if (json["state"] === "running") {
    return readRunning(json, runId);
  }
  if (json["state"] === "proposed") {
    return readProposed(json, runId);
  }
  return err("its state is neither running nor proposed");
}

/**
 * Whether the record is of a run with history on or off. A record written
 * before history off existed has no `history`: it is `"git"`.
 */
function historyOf(json: Record<string, unknown>): "git" | "off" | null {
  const history = json["history"] ?? "git";
  return history === "git" || history === "off" ? history : null;
}

function readRunning(json: Record<string, unknown>, runId: string): Result<RunningRecord, string> {
  const { base, worktreeId } = json;
  if (json["runId"] !== runId) {
    return err("its runId isn't the run its name says");
  }
  const history = historyOf(json);
  if (history === null) {
    return err("its history is neither git nor off");
  }
  if (history === "off") {
    return ok({ state: "running", history, runId });
  }
  if (!isCommitId(base)) {
    return err("its base isn't a full commit id");
  }
  if (typeof worktreeId !== "string" || worktreeId === "") {
    return err("its worktreeId isn't text");
  }
  return ok({ state: "running", history, runId, base, worktreeId });
}

function readProposed(
  json: Record<string, unknown>,
  runId: string,
): Result<ProposedRecord, string> {
  const { proposal: proposalJson, finishedAt, decisions: decisionsJson } = json;
  const proposal = readProposal(proposalJson, runId);
  if (!proposal.ok) {
    return proposal;
  }
  if (!isDate(finishedAt)) {
    return err("its finishedAt isn't a date");
  }
  const decisions = readDecisions(decisionsJson, proposal.value.files);
  if (!decisions.ok) {
    return decisions;
  }
  let record: ProposedRecord = {
    state: "proposed",
    proposal: proposal.value,
    finishedAt,
    decisions: decisions.value,
  };
  if (json["partly"] !== undefined) {
    const partly = readPartly(json["partly"], decisions.value);
    if (!partly.ok) {
      return partly;
    }
    record = { ...record, partly: partly.value };
  }
  if (json["settled"] !== undefined) {
    const settled = readSettled(json["settled"]);
    if (settled === null) {
      return err("its settled isn't a date and a reason");
    }
    record = { ...record, settled };
  }
  return ok(record);
}

const settledReasons: ReadonlySet<unknown> = new Set(["decided", "expired", "unavailable"]);

function readSettled(json: unknown): Settled | null {
  if (!isPlainObject(json)) {
    return null;
  }
  const { at, why } = json;
  return isDate(at) && settledReasons.has(why) ? { at, why: why as Settled["why"] } : null;
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function readProposal(json: unknown, runId: string): Result<RunProposal, string> {
  if (!isPlainObject(json) || json["runId"] !== runId) {
    return err("its proposal isn't about the run its name says");
  }
  const { files: filesJson, items } = json;
  if (!Array.isArray(items) || !items.every((item) => typeof item === "string")) {
    return err("its proposal's items aren't a list of ids");
  }
  if (!Array.isArray(filesJson)) {
    return err("its proposal's files aren't a list");
  }
  const files: ProposedFile[] = [];
  for (const fileJson of filesJson) {
    const file = readProposedFile(fileJson);
    if (file === null) {
      return err("its proposal has a file without a path, change and base");
    }
    files.push(file);
  }
  return readWhereTextsAre(json, { runId, files, items });
}

/** Reads where a proposal's texts are: its base and ref with history on, nothing with history off. */
function readWhereTextsAre(
  json: Record<string, unknown>,
  fields: Pick<RunProposal, "runId" | "files" | "items">,
): Result<RunProposal, string> {
  const { base, ref } = json;
  const history = historyOf(json);
  if (history === null) {
    return err("its proposal's history is neither git nor off");
  }
  if (history === "off") {
    if (base !== null || ref !== null) {
      return err("its proposal has history off but a base or a ref");
    }
    const proposal: HistoryOffProposal = { ...fields, history, base, ref };
    return ok(proposal);
  }
  if (!isCommitId(base)) {
    return err("its proposal's base isn't a full commit id");
  }
  if (ref !== proposalRefOf(fields.runId)) {
    return err("its proposal's ref isn't the run's proposal ref");
  }
  const proposal: HistoryOnProposal = { ...fields, history, base, ref };
  return ok(proposal);
}

const changes: ReadonlySet<unknown> = new Set(["added", "modified", "deleted"]);
const digestPattern = /^sha256:[0-9a-f]{64}$/u;

function readProposedFile(json: unknown): ProposedFile | null {
  if (!isPlainObject(json)) {
    return null;
  }
  const { path, change, base: baseJson } = json;
  if (typeof path !== "string" || path === "" || !changes.has(change)) {
    return null;
  }
  const base = readFileBase(baseJson);
  if (base === null || (base === "absent") !== (change === "added")) {
    return null;
  }
  return { path, change: change as ProposedFile["change"], base };
}

function readFileBase(json: unknown): FileBase | null {
  if (json === "absent") {
    return "absent";
  }
  const digest = isPlainObject(json) ? json["digest"] : undefined;
  return typeof digest === "string" && digestPattern.test(digest)
    ? { digest: digest as `sha256:${string}` }
    : null;
}

const decisionValues: ReadonlySet<unknown> = new Set([
  "accepted",
  "rejected",
  "undecided",
  "not-applicable",
]);

function readDecisions(
  json: unknown,
  files: readonly ProposedFile[],
): Result<Record<string, Decision>, string> {
  if (!isPlainObject(json)) {
    return err("its decisions aren't a JSON object");
  }
  const decisions: Record<string, Decision> = {};
  for (const { path } of files) {
    const decision = json[path];
    if (!decisionValues.has(decision)) {
      return err(`its decision for ${JSON.stringify(path)} isn't one it knows`);
    }
    decisions[path] = decision as Decision;
  }
  return ok(decisions);
}

/** Reads `partly`: each entry is about an undecided file of the proposal. */
function readPartly(
  json: unknown,
  decisions: Readonly<Record<string, Decision>>,
): Result<Record<string, PartlyDecided>, string> {
  if (!isPlainObject(json)) {
    return err("its partly decided files aren't a JSON object");
  }
  const partly: Record<string, PartlyDecided> = {};
  for (const [path, entry] of Object.entries(json)) {
    if (decisions[path] !== "undecided") {
      return err(`its partly decided ${JSON.stringify(path)} isn't an undecided file`);
    }
    const saved = isPlainObject(entry) ? entry["saved"] : undefined;
    const run = isPlainObject(entry) ? entry["run"] : undefined;
    if (typeof saved !== "string" || !digestPattern.test(saved) || typeof run !== "string") {
      return err(`its partly decided ${JSON.stringify(path)} has no saved digest and run text`);
    }
    partly[path] = { saved: saved as PartlyDecided["saved"], run };
  }
  return ok(partly);
}

function isCommitId(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  try {
    checkCommitId(value);
    return true;
  } catch {
    return false;
  }
}
