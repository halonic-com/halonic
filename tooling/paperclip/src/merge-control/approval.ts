import {
  isLiamPath,
  julianRebaseRefusal,
  overLineLimit,
  type RoutedPull,
  reviewerRoleFor,
  routedPaths,
  routineRefusal,
  unknownRename,
} from "../reviewer-paths.ts";
import { manifestFileOf } from "../reviewer-paths-manifest.ts";
import { sensitiveOrigin, writtenByTeam } from "../reviewer-paths-routine.ts";
import { blockWords, signedApproval } from "./signed.ts";
import type { GatePull, PullText } from "./snapshot.ts";

/**
 * The approval rules of the gate (MERGER.md §4, rules 1–6): signed
 * approvals on the current head after the last push, carry-over across a
 * rebase with an identical diff, Julian within `reviewerRoleFor` or re-approving
 * after a rebase-only push (HAL-18459), Nora within `routineRefusal`
 * (HAL-19283), "Author: Liam", Julian's approval too on a plugin manifest
 * change (HAL-19440); open change requests are in `change-request.ts`. A
 * renamed file counts by its old path too. The texts follow the Merger's own matching,
 * which differs from `pr-tools/approvals.ts`: a bare "re-approved on head"
 * counts here (HAL-15553), and time after the last push matters. A signed
 * line counts on any line of a comment, outside code and quotes, once, and
 * never in a change request (`signed.ts`, HAL-17946, HAL-17927).
 */

/** A reviewer whose approval counts within Julian's scope. */
type ScopedReviewer = "Julian" | "Nora";

/** How a pull request's approval stands on its head. */
export interface ApprovalVerdict {
  readonly ok: boolean;
  readonly at?: string;
  /** Approved by Julian within his scope. */
  readonly julian?: boolean;
  /** Approved by Nora within her scope, which is Julian's (HAL-19248). */
  readonly nora?: boolean;
  /** The older head whose approval carried over. */
  readonly carried?: string;
  /** Names another head. */
  readonly stale?: string;
  /** Names this head but came before the last push. */
  readonly moved?: boolean;
  /** Liam approved his own pull request. */
  readonly selfLiam?: boolean;
}

/** The approval, and what the gate says about it. */
export interface ApprovalResult {
  readonly approval: ApprovalVerdict | null;
  readonly reasons: readonly string[];
  /** Needs a new review of the current head. */
  readonly reReview: boolean;
}

/** The later of the head commit and the last force-push. */
export function lastPushOf(pull: GatePull): string {
  return [pull.headCommittedAt, ...pull.forcePushedAt].sort().pop() ?? "";
}

function byAt(a: PullText, b: PullText): number {
  return a.at.localeCompare(b.at);
}

export function teamTexts(pull: GatePull, teamLogin: string): PullText[] {
  return pull.texts.filter((text) => text.by === teamLogin).sort(byAt);
}

/** The queue manager's own comments name heads and approvals: never read them (lesson 2). */
export function ours(text: PullText): boolean {
  return /queue manager/i.test(text.body);
}

export function sameHead(head: string, sha: string): boolean {
  return head.startsWith(sha.slice(0, 7));
}

/** An approval of `from` holds on `to` when both have the same changes; never from the same head (HAL-19778). */
function carriedOver(patchIds: Readonly<Record<string, string | null>>, from: string, to: string) {
  if (sameHead(to, from)) {
    return false;
  }
  const a = patchIds[from];
  const b = patchIds[to];
  return a !== undefined && a !== null && a === b;
}

/** Liam's newest signed verdict on the pull request. */
export function liamApproval(pull: GatePull, teamLogin: string): ApprovalVerdict | null {
  let verdict: ApprovalVerdict | null = null;
  for (const text of teamTexts(pull, teamLogin)) {
    if (ours(text)) {
      continue;
    }
    const sha = signedApproval(text.body, "Liam")?.sha;
    if (sha === undefined) {
      if (
        text.reviewState === "APPROVED" &&
        text.commit === pull.head &&
        /\bLiam\b/.test(text.body)
      ) {
        verdict = { ok: true, at: text.at };
      }
      continue;
    }
    verdict = sameHead(pull.head, sha)
      ? { ok: true, at: text.at }
      : { ok: false, stale: sha, at: text.at };
  }
  return verdict;
}

/** Julian's signed approval as the gate reads it: "Author: Liam", and the head a rebase-only re-approval names. */
export type JulianApproval = ApprovalVerdict & {
  readonly authorLiam: boolean;
  readonly rebaseOf?: string;
};

/** Julian's (or Nora's) newest signed approval, with whether it holds on the head. */
export function julianApproval(
  pull: GatePull,
  teamLogin: string,
  patchIds: Readonly<Record<string, string | null>>,
  reviewer: ScopedReviewer = "Julian",
): JulianApproval | null {
  const text = teamTexts(pull, teamLogin)
    .filter((each) => !ours(each) && signedApproval(each.body, reviewer) !== null)
    .pop();
  const signed = text === undefined ? null : signedApproval(text.body, reviewer);
  if (text === undefined || signed === null) {
    return null;
  }
  const { sha } = signed;
  const read = {
    authorLiam: /\bAuthor:\s*Liam\b/i.test(text.body),
    ...(signed.rebaseOf === undefined ? {} : { rebaseOf: signed.rebaseOf }),
  };
  if (sameHead(pull.head, sha) && text.at >= lastPushOf(pull)) {
    return { ok: true, at: text.at, ...read };
  }
  if (carriedOver(patchIds, sha, pull.head)) {
    return { ok: true, at: text.at, carried: sha, ...read };
  }
  return { ok: false, stale: sha, ...read };
}

/**
 * Whether Julian's approval is a re-approval after a rebase-only push of a
 * head Liam signed, on a pull request `julianRebaseRefusal` allows: then it
 * counts outside his limits too (HAL-18459). Every changed file must be
 * known, or a security path could hide among the ones not listed.
 */
export function rebaseOnlyAfterLiam(
  pull: GatePull,
  teamLogin: string,
  julian: JulianApproval,
): boolean {
  const { rebaseOf } = julian;
  if (rebaseOf === undefined || pull.filesTotal > pull.files.length) {
    return false;
  }
  const routed = routedOf(pull);
  if (unknownRename(routed) !== undefined) {
    return false;
  }
  if (julianRebaseRefusal({ files: routedPaths(routed), branch: pull.branch }) !== null) {
    return false;
  }
  return teamTexts(pull, teamLogin).some((text) => {
    const liam = ours(text) ? undefined : signedApproval(text.body, "Liam")?.sha;
    return liam !== undefined && (liam.startsWith(rebaseOf) || rebaseOf.startsWith(liam));
  });
}

/**
 * The pull request as the reviewer path list reads it: renamed files' old
 * paths, who wrote it, and whether its branch or labels make it a security
 * or release one (HAL-19283).
 */
export function routedOf(pull: GatePull): RoutedPull {
  return {
    files: pull.files,
    changedLines: pull.additions + pull.deletions,
    sensitive: sensitiveOrigin(pull),
    ...(pull.fileLines === undefined ? {} : { fileLines: pull.fileLines }),
    ...(pull.manifests === undefined ? {} : { manifests: pull.manifests }),
    ...(pull.previousPaths === undefined ? {} : { previousPaths: pull.previousPaths }),
    ours: writtenByTeam(pull),
  };
}

/** Why Julian's approval doesn't count here, or null when it is within his scope (HAL-14809). */
export function outsideJulianScope(pull: GatePull): string | null {
  return outsideScope(pull, "Julian");
}

/**
 * Why Nora's approval doesn't count here: Julian's limits, never on her own
 * branch, and none of the routine reviewer's exclusions (`routineRefusal`:
 * core, host, the spec helper, a public interface; HAL-19246, HAL-19248).
 */
export function outsideNoraScope(pull: GatePull): string | null {
  return outsideScope(pull, "Nora");
}

function outsideScope(pull: GatePull, reviewer: ScopedReviewer): string | null {
  if (pull.filesTotal > pull.files.length) {
    return `${pull.filesTotal} files (can't check all)`;
  }
  if (pull.branch.startsWith("changeset-release/")) {
    return "changeset-release branch";
  }
  if (pull.branch.startsWith(`${reviewer.toLowerCase()}/`)) {
    return `${reviewer}'s own branch`;
  }
  const routed = routedOf(pull);
  // By role, as the PR watcher routes (`reviewerRoleFor`): a routing never widens Julian's limits.
  // The routine reviewer's scope (HAL-19246) is inside them, so Julian's approval counts there too.
  if (reviewerRoleFor(routed) === "code-reviewer") {
    return codeReviewerReason(routed);
  }
  return reviewer === "Nora" ? routineRefusal(routed) : null;
}

/** Why only the code reviewer may approve this pull request, in the gate's words. */
function codeReviewerReason(routed: RoutedPull): string {
  if (routed.sensitive) {
    return "a security or release pull request";
  }
  const renamed = unknownRename(routed);
  if (renamed !== undefined) {
    return `renames ${renamed} from a path that isn't known`;
  }
  const bad = routedPaths(routed).filter(isLiamPath);
  if (bad.length > 0) {
    return `touches ${bad.slice(0, 2).join(", ")}${bad.length > 2 ? " …" : ""}`;
  }
  const tooBig = overLineLimit(routed);
  if (tooBig !== undefined) {
    return tooBig;
  }
  return "changes a package.json field Liam owns, or the lockfile";
}

function liamChangeRequestAt(pull: GatePull, teamLogin: string): string {
  return (
    teamTexts(pull, teamLogin)
      .filter(
        (text) =>
          /\bLiam\b/.test(text.body.slice(0, 160)) && blockWords.test(text.body.slice(0, 600)),
      )
      .pop()?.at ?? ""
  );
}

type PatchIds = Readonly<Record<string, string | null>>;

function withAt(at: string | undefined): { readonly at?: string } {
  return at === undefined ? {} : { at };
}

/** Liam's verdict on the head: after the last push, not on his own pull request, carried over a rebase. */
function liamVerdict(
  pull: GatePull,
  teamLogin: string,
  patchIds: PatchIds,
): ApprovalVerdict | null {
  const approval = liamApproval(pull, teamLogin);
  // Nobody approves their own pull request, not even through a carry-over (#4284).
  if (approval !== null && pull.branch.startsWith("liam/")) {
    return { ok: false, selfLiam: true };
  }
  if (approval?.ok === true && approval.at !== undefined && approval.at < lastPushOf(pull)) {
    return { ok: false, moved: true };
  }
  if (approval?.stale !== undefined && carriedOver(patchIds, approval.stale, pull.head)) {
    return { ok: true, carried: approval.stale, ...withAt(approval.at) };
  }
  return approval;
}

/** Julian's approval when it counts, or the note that says why it doesn't. */
function julianVerdict(
  pull: GatePull,
  teamLogin: string,
  patchIds: PatchIds,
): { readonly approval?: ApprovalVerdict; readonly note?: string } {
  const julian = julianApproval(pull, teamLogin, patchIds);
  if (julian?.ok !== true) {
    return {};
  }
  const liamOwn = pull.branch.startsWith("liam/");
  const anyPath = liamOwn && julian.authorLiam && !pull.branch.startsWith("changeset-release/");
  if (liamRequestOpen(pull, teamLogin)) {
    return { note: liamRequestNote };
  }
  const out = anyPath ? null : outsideJulianScope(pull);
  if (out === null || (!liamOwn && rebaseOnlyAfterLiam(pull, teamLogin, julian))) {
    const carried = julian.carried === undefined ? {} : { carried: julian.carried };
    return { approval: { ok: true, julian: true, ...withAt(julian.at), ...carried } };
  }
  return {
    note: liamOwn
      ? `Liam's own PR and outside Julian's scope (${out}): no second reviewer is set for this; for the board`
      : `Julian approved, but it is outside his scope (${out}): needs Liam`,
  };
}

const liamRequestNote = "waiting for Liam: his change request on this head is still open";

function liamRequestOpen(pull: GatePull, teamLogin: string): boolean {
  const liamRequest = liamChangeRequestAt(pull, teamLogin);
  return liamRequest !== "" && liamRequest >= lastPushOf(pull);
}

/**
 * Nora's approval when it counts, or the note that says why it doesn't. She
 * shares Julian's scope without his exceptions: no "Author: Liam" on any
 * path, no rebase-only re-approval outside it (board, 26 Nov, HAL-19248).
 */
function noraVerdict(
  pull: GatePull,
  teamLogin: string,
  patchIds: PatchIds,
): { readonly approval?: ApprovalVerdict; readonly note?: string } {
  const nora = julianApproval(pull, teamLogin, patchIds, "Nora");
  if (nora?.ok !== true) {
    return {};
  }
  if (liamRequestOpen(pull, teamLogin)) {
    return { note: liamRequestNote };
  }
  const out = outsideNoraScope(pull);
  if (out === null) {
    const carried = nora.carried === undefined ? {} : { carried: nora.carried };
    return { approval: { ok: true, nora: true, ...withAt(nora.at), ...carried } };
  }
  const next = outsideJulianScope(pull) === null ? "Julian or Liam" : "Liam";
  return { note: `Nora approved, but it is outside her scope (${out}): needs ${next}` };
}

function approvalReason(pull: GatePull, approval: ApprovalVerdict | null, reReview: boolean) {
  const h9 = pull.head.slice(0, 9);
  if (pull.branch.startsWith("liam/") && (approval === null || approval.selfLiam === true)) {
    return `Liam's own PR: needs a second reviewer's approval (Julian or Nora, within their scope) on head ${h9}`;
  }
  if (approval === null) {
    return `no approval from Liam found for head ${h9}`;
  }
  if (reReview) {
    const why =
      approval.stale === undefined
        ? " (pushed after the approval)"
        : ` (Liam approved ${approval.stale.slice(0, 9)}, a different head)`;
    return `waiting for re-review of ${h9}${why}`;
  }
  return approval.ok ? undefined : `Liam's latest review on head ${h9} is not an approval`;
}

/** The approval rules for one pull request. */
export function approvalOf(pull: GatePull, teamLogin: string, patchIds: PatchIds): ApprovalResult {
  let approval = liamVerdict(pull, teamLogin, patchIds);
  let note: string | undefined;
  if (approval?.ok !== true) {
    const julian = julianVerdict(pull, teamLogin, patchIds);
    const nora = julian.approval === undefined ? noraVerdict(pull, teamLogin, patchIds) : {};
    approval = julian.approval ?? nora.approval ?? approval;
    note = nora.approval === undefined ? (julian.note ?? nora.note) : undefined;
  }
  const reReview =
    approval?.ok === false && (approval.stale !== undefined || approval.moved === true);
  const reason = approvalReason(pull, approval, reReview);
  const liamOwnWaiting = reason?.startsWith("Liam's own PR") === true && note !== undefined;
  const reasons = [
    note,
    liamOwnWaiting ? undefined : reason,
    manifestReason(pull, teamLogin, patchIds),
  ].filter((each): each is string => each !== undefined);
  return { approval, reasons, reReview };
}

/**
 * Why a plugin manifest change still waits for Julian, or undefined: the
 * plugin deployer ships it only with his approval on the head, whoever else
 * approved (HAL-19440). Here his approval counts at any size and on any path,
 * as long as it holds on the head; never on his own pull request. Only the
 * files the snapshot lists are checked: the deployer refuses a pull request
 * with more files anyway.
 */
function manifestReason(pull: GatePull, teamLogin: string, patchIds: PatchIds): string | undefined {
  const manifest = manifestFileOf(pull.files);
  if (manifest === undefined) {
    return undefined;
  }
  const h9 = pull.head.slice(0, 9);
  if (pull.branch.startsWith("julian/")) {
    return `Julian's own PR changes a plugin manifest (${manifest}): no second security reviewer is set for this; for the board`;
  }
  if (julianApproval(pull, teamLogin, patchIds)?.ok === true) {
    return undefined;
  }
  return `changes a plugin manifest (${manifest}): needs Julian's approval on head ${h9} too`;
}
