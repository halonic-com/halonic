import { isLiamPath, julianRebaseRefusal, overLineLimit, reviewerFor } from "../reviewer-paths.ts";
import { anySignedApproval, blockWords, fixedWords, signedApproval } from "./signed.ts";
import type { GatePull, PullText } from "./snapshot.ts";

/**
 * The approval rules of the gate (MERGER.md §4, rules 1–6): signed
 * approvals on the current head after the last push, carry-over across a
 * rebase with an identical diff, Julian within `reviewerFor` or re-approving
 * after a rebase-only push (HAL-18459), "Author: Liam", and open change
 * requests. The texts follow the Merger's own matching,
 * which differs from `pr-tools/approvals.ts`: a bare "re-approved on head"
 * counts here (HAL-15553), and time after the last push matters. A signed
 * line counts on any line of a comment, outside code and quotes, once, and
 * never in a change request (`signed.ts`, HAL-17946, HAL-17927).
 */

const signedLine = /^[ \t]*(Liam|Julian):/im;
const rejectWords =
  /\b(changes requested|request(ing)? changes|blocking|not approved|do not merge|don't merge|needs? (a )?(fix|rework|changes)|reject)/i;

/** How a pull request's approval stands on its head. */
export interface ApprovalVerdict {
  readonly ok: boolean;
  readonly at?: string;
  /** Approved by Julian within his scope. */
  readonly julian?: boolean;
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

function teamTexts(pull: GatePull, teamLogin: string): PullText[] {
  return pull.texts.filter((text) => text.by === teamLogin).sort(byAt);
}

/** The queue manager's own comments name heads and approvals: never read them (lesson 2). */
function ours(text: PullText): boolean {
  return /queue manager/i.test(text.body);
}

function sameHead(head: string, sha: string): boolean {
  return head.startsWith(sha.slice(0, 7));
}

function carriedOver(patchIds: Readonly<Record<string, string | null>>, from: string, to: string) {
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

/** Julian's newest signed approval, with whether it holds on the head. */
export function julianApproval(
  pull: GatePull,
  teamLogin: string,
  patchIds: Readonly<Record<string, string | null>>,
): JulianApproval | null {
  const text = teamTexts(pull, teamLogin)
    .filter((each) => !ours(each) && signedApproval(each.body, "Julian") !== null)
    .pop();
  const signed = text === undefined ? null : signedApproval(text.body, "Julian");
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
  if (julianRebaseRefusal({ files: pull.files, branch: pull.branch }) !== null) {
    return false;
  }
  return teamTexts(pull, teamLogin).some((text) => {
    const liam = ours(text) ? undefined : signedApproval(text.body, "Liam")?.sha;
    return liam !== undefined && (liam.startsWith(rebaseOf) || rebaseOf.startsWith(liam));
  });
}

/** Why Julian's approval doesn't count here, or null when it is within his scope (HAL-14809). */
export function outsideJulianScope(pull: GatePull): string | null {
  if (pull.filesTotal > pull.files.length) {
    return `${pull.filesTotal} files (can't check all)`;
  }
  if (pull.branch.startsWith("changeset-release/")) {
    return "changeset-release branch";
  }
  if (pull.branch.startsWith("julian/")) {
    return "Julian's own branch";
  }
  const changedLines = pull.additions + pull.deletions;
  const routed = {
    files: pull.files,
    changedLines,
    sensitive: false,
    ...(pull.manifests === undefined ? {} : { manifests: pull.manifests }),
  };
  if (reviewerFor(routed) === "julian") {
    return null;
  }
  const bad = pull.files.filter(isLiamPath);
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
  const liamRequest = liamChangeRequestAt(pull, teamLogin);
  if (liamRequest !== "" && liamRequest >= lastPushOf(pull)) {
    return { note: "waiting for Liam: his change request on this head is still open" };
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

function approvalReason(pull: GatePull, approval: ApprovalVerdict | null, reReview: boolean) {
  const h9 = pull.head.slice(0, 9);
  if (pull.branch.startsWith("liam/") && (approval === null || approval.selfLiam === true)) {
    return `Liam's own PR: needs a second reviewer's approval (Julian, within his scope) on head ${h9}`;
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
    approval = julian.approval ?? approval;
    note = julian.note;
  }
  const reReview =
    approval?.ok === false && (approval.stale !== undefined || approval.moved === true);
  const reason = approvalReason(pull, approval, reReview);
  const liamOwnWaiting = reason?.startsWith("Liam's own PR") === true && note !== undefined;
  const reasons = [note, liamOwnWaiting ? undefined : reason].filter(
    (each): each is string => each !== undefined,
  );
  return { approval, reasons, reReview };
}

/** An open change request newer than the head's approval. */
export interface ChangeRequest {
  readonly who: string;
  readonly at: string;
}

/** Its first line approves, or any line is a signed approval: then its notes aren't a change request. */
function approves(body: string): boolean {
  const first = body.split("\n")[0] ?? "";
  const firstApproves = /\bapprov/i.test(first) && !/\b(not|un)\s*approv/i.test(first);
  return firstApproves || anySignedApproval(body) !== null;
}

function approvesHead(text: PullText, head: string): boolean {
  const sha = anySignedApproval(text.body)?.sha;
  return sha !== undefined && sameHead(head, sha);
}

/**
 * The newest change request by Liam or Julian that is newer than the head's
 * approval, in words (rule 6) or as the newest signed line naming a head.
 */
export function changeRequestOf(
  pull: GatePull,
  teamLogin: string,
  approval: ApprovalVerdict | null,
): ChangeRequest | null {
  const texts = teamTexts(pull, teamLogin).filter((text) => !ours(text));
  const named = texts.filter((text) => /\b(Liam|Julian)\b/.test(text.body.slice(0, 160)));
  const blocks = named.filter(
    (text) =>
      !approves(text.body) && blockWords.test(text.body.slice(0, 600).replace(fixedWords, "")),
  );
  const last = blocks.pop();
  if (last !== undefined) {
    const approvedAt =
      named.filter((text) => approvesHead(text, pull.head)).pop()?.at ?? approval?.at ?? "";
    if (last.at > approvedAt) {
      return {
        who: /\b(Liam|Julian)\b/.exec(last.body.slice(0, 160))?.[1] ?? "a reviewer",
        at: last.at,
      };
    }
  }
  const signed = texts
    .filter((text) => signedLine.test(text.body) && /\b[0-9a-f]{7,40}\b/.test(text.body))
    .pop();
  if (signed === undefined || anySignedApproval(signed.body) !== null) {
    return null;
  }
  const words = signed.body.slice(0, 600).replace(fixedWords, "");
  if (!blockWords.test(words) && !rejectWords.test(words)) {
    return null;
  }
  return { who: signedLine.exec(signed.body)?.[1] ?? "a reviewer", at: signed.at };
}
