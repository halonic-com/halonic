import { decisionNoteFile, parseDecisionNote } from "../guard/decision-notes.ts";
import { approversFile, splitSignature } from "../guard/signatures.ts";
import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";

/**
 * The signed note that lists the notes merged without a signature while the
 * note check was still advisory (HAL-11244). It is append-only like every
 * note on `main`, so the list only grows with the CTO's signature.
 */
export const unsignedNotesRecord = "decisions/liam/HAL-11244-note-record.md";

/** The heading in the record above its list of unsigned notes. */
const listHeading = "## Notes without a signature";

/**
 * The note paths the record lists under its heading, one `- ` item each,
 * with or without backticks. An empty list without the record.
 */
export function listedUnsignedNotes(text: string | undefined): Set<string> {
  const lines = (text ?? "").split("\n");
  const start = lines.findIndex((line) => line.trim() === listHeading);
  const listed = new Set<string>();
  if (start === -1) {
    return listed;
  }
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) {
      break;
    }
    if (trimmed.startsWith("- ")) {
      listed.add(trimmed.slice(2).trim().replaceAll("`", ""));
    }
  }
  return listed;
}

/** The key IDs `approvers.json` pins, for any kind. */
function pinnedKeyIds(text: string): Set<string> {
  const lists = Object.values(JSON.parse(text) as Record<string, { id: string }[]>);
  return new Set(lists.flat().map((approver) => approver.id));
}

/**
 * Fails on a decision note in the tree that has no valid signature line
 * from a pinned key, or that doesn't parse. The note check verifies a
 * signature when its pull request merges; this rule keeps an unsigned note
 * from landing on `main` past it. The signature binds the pull request's
 * number, which the tree doesn't know, so only its form and key are checked
 * here. The notes `unsignedNotesRecord` lists are exempt, and so is the
 * branch's own note on a pull request (`branch`): the note check is the
 * gate for that one, and it is signed last.
 */
export function checkNotesSigned(context: CheckContext, branch?: string): Report {
  const report = new Report("notes-signed");
  const notes = context.files.filter(
    (file) => file.startsWith("decisions/") && file.endsWith(".md"),
  );
  if (notes.length === 0) {
    return report;
  }
  if (!context.files.includes(approversFile)) {
    report.error(approversFile, "The decision notes can't be checked without the approvers file.");
    return report;
  }
  const keys = pinnedKeyIds(context.read(approversFile));
  const record = context.files.includes(unsignedNotesRecord)
    ? context.read(unsignedNotesRecord)
    : undefined;
  const listed = listedUnsignedNotes(record);
  const own = branch ? decisionNoteFile(branch) : undefined;
  for (const file of notes.filter((note) => !listed.has(note) && note !== own)) {
    const text = context.read(file);
    const split = splitSignature(text);
    if (!split.ok) {
      report.error(file, `This decision note isn't signed: ${split.reason}.`);
      continue;
    }
    const unknown = split.signatures.find((signature) => !keys.has(signature.keyId));
    if (unknown !== undefined) {
      report.error(
        file,
        `This decision note is signed by ${unknown.keyId}, a key ${approversFile} doesn't pin.`,
      );
    }
    const parsed = parseDecisionNote(file, split.unsigned);
    if (!parsed.ok) {
      const [first] = parsed.problems;
      report.error(file, `This decision note is malformed: ${first?.message}`, first?.line);
    }
  }
  return report;
}
