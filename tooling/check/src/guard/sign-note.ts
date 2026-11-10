import { createPrivateKey, createPublicKey } from "node:crypto";
import { noteSignedText, type PullRequest } from "./approvals.ts";
import { decisionNoteFile, parseDecisionNote } from "./decision-notes.ts";
import {
  approversFile,
  type GitObjects,
  keyIdOf,
  parseApprovers,
  signatureLine,
} from "./signatures.ts";

/** What signing a note gives: the exact text signed and the line to add, or why not. */
export type SignedNote =
  | { readonly ok: true; readonly text: string; readonly line: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Signs a pull request's decision note (HAL-1337), reading it and every
 * covered file from git's objects at the pull request's head, as the guard
 * will. Refuses a note that already has a signature line, has a carriage
 * return or doesn't parse, and a key the base doesn't pin for its kind.
 */
export function signNote(
  pull: PullRequest,
  branch: string,
  git: GitObjects,
  privateKeyPem: string,
): SignedNote {
  const file = decisionNoteFile(branch);
  const text = git.readFile(pull.head, file);
  if (text === undefined) {
    return { ok: false, reason: `the pull request's head has no ${file}` };
  }
  if (git.objectId(pull.base, file) !== undefined) {
    return {
      ok: false,
      reason: `${file} is already on the base branch; the branch needs a new name`,
    };
  }
  if (text.includes("\r")) {
    return { ok: false, reason: `${file} has a carriage return; save it with LF line endings` };
  }
  if (/^\s*-\s*Signature\s*:/m.test(text)) {
    return { ok: false, reason: `${file} already has a signature line; remove it to sign again` };
  }
  const parsed = parseDecisionNote(file, text);
  if (!parsed.ok) {
    const problems = parsed.problems.map((problem) => `line ${problem.line}: ${problem.message}`);
    return { ok: false, reason: `${file} is malformed: ${problems.join(" ")}` };
  }
  const keyId = keyIdOf(createPublicKey(createPrivateKey(privateKeyPem)));
  const pinned = parseApprovers(git.readFile(pull.base, approversFile) ?? "{}");
  if (!pinned[parsed.note.kind].some((approver) => approver.id === keyId)) {
    return {
      ok: false,
      reason: `your key ${keyId} isn't pinned for ${parsed.note.kind} notes in the base's ${approversFile}`,
    };
  }
  const signed = noteSignedText(parsed.note, text, pull, git);
  return { ok: true, text: signed, line: signatureLine(signed, privateKeyPem) };
}
