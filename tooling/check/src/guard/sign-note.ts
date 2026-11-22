import { createPrivateKey, createPublicKey, verify } from "node:crypto";
import { noteSignedText, type PullRequest } from "./approvals.ts";
import { decisionNoteFile, parseDecisionNote } from "./decision-notes.ts";
import {
  approversFile,
  type GitObjects,
  keyIdOf,
  maxSignatures,
  type NoteSignature,
  parseApprovers,
  signatureLine,
  splitSignature,
} from "./signatures.ts";

/**
 * What signing a note gives: the exact text signed and the line to add, or
 * why not. `replaces` is set when the line replaces this key's own line,
 * which no longer matches the pull request (HAL-16390).
 */
export type SignedNote =
  | {
      readonly ok: true;
      readonly text: string;
      readonly line: string;
      readonly replaces?: NoteSignature;
    }
  | { readonly ok: false; readonly reason: string };

/**
 * Signs a pull request's decision note (HAL-1337), reading it and every
 * covered file from git's objects at the pull request's head, as the guard
 * will. A note a first guardian signed can take a second line: the text
 * signed leaves every signature line out. A line from the same key that no
 * longer matches, say after a rebase changed a covered file, is replaced.
 * Refuses a note with a carriage return, a still-valid line from the same
 * key, a third line from another key, a note that
 * doesn't parse, a key the base pins neither for its kind nor as a
 * guardian and a base whose approvers file can't be read.
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
  const split = /^\s*-\s*Signature\s*:/m.test(text) ? splitSignature(text) : undefined;
  if (split !== undefined && !split.ok) {
    return { ok: false, reason: `${file}: ${split.reason}` };
  }
  const unsigned = split?.ok ? split.unsigned : text;
  const present = split?.ok ? split.signatures : [];
  const publicKey = createPublicKey(createPrivateKey(privateKeyPem));
  const keyId = keyIdOf(publicKey);
  const own = present.find((each) => each.keyId === keyId);
  if (present.filter((each) => each !== own).length >= maxSignatures) {
    return { ok: false, reason: `${file} already has ${maxSignatures} signature lines` };
  }
  const parsed = parseDecisionNote(file, text);
  if (!parsed.ok) {
    const problems = parsed.problems.map((problem) => `line ${problem.line}: ${problem.message}`);
    return { ok: false, reason: `${file} is malformed: ${problems.join(" ")}` };
  }
  let pinned: ReturnType<typeof parseApprovers>;
  try {
    pinned = parseApprovers(git.readFile(pull.base, approversFile) ?? "{}");
  } catch (error) {
    return { ok: false, reason: `the base's ${approversFile} can't be read: ${String(error)}` };
  }
  const allowed = [...pinned[parsed.note.kind], ...pinned.guardians];
  if (!allowed.some((approver) => approver.id === keyId)) {
    return {
      ok: false,
      reason: `your key ${keyId} isn't pinned for ${parsed.note.kind} notes or as a guardian in the base's ${approversFile}`,
    };
  }
  const signed = noteSignedText(parsed.note, unsigned, pull, git);
  const line = signatureLine(signed, privateKeyPem);
  if (own === undefined) {
    return { ok: true, text: signed, line };
  }
  const stillValid = verify(
    null,
    Buffer.from(signed, "utf8"),
    publicKey,
    Buffer.from(own.signature, "base64"),
  );
  return stillValid
    ? { ok: false, reason: `your key ${keyId} has already signed ${file}, and it still matches` }
    : { ok: true, text: signed, line, replaces: own };
}
