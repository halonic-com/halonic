import { findCredentialShape } from "./credential-shape.ts";
import {
  allNamesKnown,
  allNumbersKnown,
  asksForCredential,
  bannedWords,
  firstPerson,
  isBareAcknowledgement,
  negation,
  resultWords,
  timePromises,
  unhedgedAnswer,
  words,
} from "./grounding.ts";
import { type ProgressInput, progressUserText } from "./progress-prompt.ts";
import type { StepStatus } from "./safe-steps.ts";

/**
 * The plain-code check every progress note passes before it is kept
 * (HAL-19218; Liam's condition on HAL-18847 section 7, point 1, applied to
 * notes, and the must-fail list of HAL-18743 section 10). No model: a note
 * that names something the run didn't show, claims a result no step has, or
 * repeats a path, command or masked value is never kept. Only the reason code
 * is logged.
 */

/** Why a note was rejected. */
export type ProgressReason =
  | "secret_shape"
  | "credential_request"
  | "too_long"
  | "bare_acknowledgement"
  | "list_or_heading"
  | "path_or_command"
  | "unhedged_answer"
  | "first_person"
  | "banned_word"
  | "time_promise"
  | "unknown_number"
  | "unknown_name"
  | "result_word"
  | "same_opening";

/** What the check decided. */
export type ProgressCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: ProgressReason };

/** About 20 words is the rule (HAL-18743 section 4); a little room for a name. */
const maxWords = 22;
const maxCharacters = 160;

/** A list item, heading or quote at the start, or a line break, backtick or table bar anywhere. */
const listOrHeading = /^\s*(?:[-*+>#]|\d+[.)])\s|[\n`|]/;

/**
 * A path, a file name, a command line or a masked value: a note never repeats
 * them, even when a step did (HAL-18743 section 4).
 */
const pathOrCommand =
  /(?:^|[\s("'])(?:~|\.{1,2})?\/[\w.-]|\b[\w-]+\.(?:ts|tsx|js|mjs|json|md|rs|sh|ya?ml|toml|lock|txt|env)\b|•••|\$\s|--[a-z]|\bhttps?:\/\//i;

/** Words a note may start a sentence with, or use as terms, beyond the first reply's. */
const noteWords = new Set(
  (
    "ran read edited searched used checked checking looking reading running digging trying now next " +
    "then first " +
    "still probably looks seems likely might maybe close one another test tests file files command " +
    "commands code web page pull tool step steps"
  ).split(" "),
);

/** Result words a step's status can back, and the status it needs. */
const statusWords: Readonly<Record<string, StepStatus>> = {
  failed: "failed",
  failing: "failed",
  passed: "passed",
  passing: "passed",
  succeeded: "passed",
  completed: "passed",
  finished: "passed",
};

const resultPattern = new RegExp(
  `\\b(?:${[...new Set([...resultWords, ...Object.keys(statusWords)])].join("|")})\\b`,
  "gi",
);

/**
 * A result word is fine when negated, or when it is a status word ("failed",
 * "passed") and one of the new steps has that status. Every other result word
 * ("merged", "deployed", "done") is a claim no step can back.
 */
function resultWordsBacked(line: string, input: ProgressInput): boolean {
  const statuses = new Set(input.steps.map((step) => step.status));
  for (const match of line.matchAll(resultPattern)) {
    if (negation.test(line.slice(0, match.index))) {
      continue;
    }
    const needed = statusWords[match[0].toLowerCase()];
    if (needed === undefined || !statuses.has(needed)) {
      return false;
    }
  }
  return true;
}

/** The first three words, lowercased and without punctuation, to compare openings. */
function opening(note: string): string {
  return words(note.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ""))
    .slice(0, 3)
    .join(" ");
}

/**
 * Checks one note against what it was written from. Cheap checks on the note
 * alone come first; then every number and name must be in the exact text the
 * model was sent, result words need a step with that status, and the note may
 * not open like an earlier one.
 */
export function checkProgressNote(line: string, input: ProgressInput): ProgressCheck {
  const given = progressUserText(input);
  const reject = (reason: ProgressReason): ProgressCheck => ({ ok: false, reason });
  if (findCredentialShape(line) !== undefined) return reject("secret_shape");
  if (asksForCredential(line)) return reject("credential_request");
  if (line.length > maxCharacters || words(line).length > maxWords) return reject("too_long");
  if (isBareAcknowledgement(line)) return reject("bare_acknowledgement");
  if (listOrHeading.test(line)) return reject("list_or_heading");
  if (pathOrCommand.test(line)) return reject("path_or_command");
  if (unhedgedAnswer.test(line)) return reject("unhedged_answer");
  if (firstPerson.test(line)) return reject("first_person");
  if (bannedWords.test(line)) return reject("banned_word");
  if (timePromises.test(line)) return reject("time_promise");
  if (!allNumbersKnown(line, given)) return reject("unknown_number");
  if (!resultWordsBacked(line, input)) return reject("result_word");
  if (!allNamesKnown(line, given, noteWords)) return reject("unknown_name");
  if (input.earlierNotes.some((note) => opening(note) === opening(line))) {
    return reject("same_opening");
  }
  return { ok: true };
}
