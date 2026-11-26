import { type ApprovalVerdict, lastPushOf, ours, sameHead, teamTexts } from "./approval.ts";
import {
  anySignedApproval,
  blockWords,
  fixedWords,
  type Reviewer,
  signedApproval,
} from "./signed.ts";
import type { GatePull, PullText } from "./snapshot.ts";

/**
 * Open change requests (MERGER.md §4 rule 6, HAL-17703). A reviewer's change
 * request stays open until that same reviewer approves the head after it, or
 * the author pushes after it: another reviewer's approval never clears it
 * (Julian's [major] on HAL-19649, HAL-19778).
 */

const reviewers: readonly Reviewer[] = ["Liam", "Julian", "Nora"];
const reviewerName = /\b(Liam|Julian|Nora)\b/;
const rejectWords =
  /\b(changes requested|request(ing)? changes|blocking|not approved|do not merge|don't merge|needs? (a )?(fix|rework|changes)|reject)/i;

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

/** Who gave the approval verdict the gate holds. */
function approverOf(approval: ApprovalVerdict): Reviewer {
  if (approval.julian === true) {
    return "Julian";
  }
  return approval.nora === true ? "Nora" : "Liam";
}

/** Whether `request` is closed: a push after it, or the same reviewer's approval of the head after it. */
function cleared(
  pull: GatePull,
  texts: readonly PullText[],
  approval: ApprovalVerdict | null,
  request: PullText,
  who: Reviewer,
): boolean {
  if (lastPushOf(pull) > request.at) {
    return true;
  }
  const own = texts.some((text) => {
    const sha = signedApproval(text.body, who)?.sha;
    return text.at > request.at && sha !== undefined && sameHead(pull.head, sha);
  });
  const held = approval?.ok === true && approverOf(approval) === who;
  return own || (held && (approval?.at ?? "") > request.at);
}

/** The newest change request in words (rule 6) by a named reviewer. */
function requestInWords(texts: readonly PullText[]): PullText | undefined {
  return texts
    .filter(
      (text) =>
        reviewerName.test(text.body.slice(0, 160)) &&
        !approves(text.body) &&
        blockWords.test(text.body.slice(0, 600).replace(fixedWords, "")),
    )
    .pop();
}

/** The reviewer's newest signed line naming a head, when it rejects it. */
function signedRejection(texts: readonly PullText[], who: Reviewer): PullText | undefined {
  const own = new RegExp(`^[ \\t]*${who}:`, "im");
  const signed = texts
    .filter((text) => own.test(text.body) && /\b[0-9a-f]{7,40}\b/.test(text.body))
    .pop();
  if (signed === undefined || signedApproval(signed.body, who) !== null) {
    return undefined;
  }
  const words = signed.body.slice(0, 600).replace(fixedWords, "");
  return blockWords.test(words) || rejectWords.test(words) ? signed : undefined;
}

/**
 * The newest open change request by Liam, Julian or Nora, in words or as
 * a reviewer's newest signed line naming a head that rejects it.
 */
export function changeRequestOf(
  pull: GatePull,
  teamLogin: string,
  approval: ApprovalVerdict | null,
): ChangeRequest | null {
  const texts = teamTexts(pull, teamLogin).filter((text) => !ours(text));
  const inWords = requestInWords(texts);
  const named = inWords === undefined ? [] : [{ text: inWords, who: whoOf(inWords) }];
  const signed = reviewers.flatMap((who) => {
    const text = signedRejection(texts, who);
    return text === undefined ? [] : [{ text, who }];
  });
  const open = [...named, ...signed]
    .filter((each) => !cleared(pull, texts, approval, each.text, each.who))
    .sort((a, b) => a.text.at.localeCompare(b.text.at))
    .pop();
  return open === undefined ? null : { who: open.who, at: open.text.at };
}

/** The reviewer a change request in words names first. */
function whoOf(text: PullText): Reviewer {
  const name = reviewerName.exec(text.body.slice(0, 160))?.[1];
  return reviewers.find((each) => each === name) ?? "Liam";
}
