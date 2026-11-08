/**
 * Decision notes (plan 9.3): `decisions/<branch-name>.md`. A pull request
 * that changes a recorded requirement, weakens a test or changes a golden
 * file adds one. The note says what changes and why, links a Paperclip
 * approval and lists exactly what it covers.
 *
 * ```markdown
 * # Decision: retire the old timer rule
 *
 * - Approval: https://paperclip.example/HAL/approvals/1234
 * - Kind: internal
 *
 * The timer moved to the routines package, so …
 *
 * ## Covers
 *
 * - workflow.timer-fires
 * - packages/core/workflow/src/timer.test.ts
 * ```
 */

/**
 * Who approves (D13): the user approves changes to user-visible
 * behaviour, the CTO internal ones.
 */
export type DecisionKind = "user-visible" | "internal";

/** A decision note that parsed cleanly. */
export interface DecisionNote {
  readonly file: string;
  /** The link to the Paperclip approval, as written. */
  readonly approval: string;
  readonly kind: DecisionKind;
  /** The requirement IDs and repo paths the note covers. */
  readonly covers: readonly string[];
}

/** A reason a note is malformed, at a line of the file. */
export interface DecisionNoteProblem {
  readonly line: number;
  readonly message: string;
}

/** What parsing a note gives: the note, or why it is malformed. */
export type ParsedDecisionNote =
  | { readonly ok: true; readonly note: DecisionNote }
  | { readonly ok: false; readonly problems: readonly DecisionNoteProblem[] };

const kinds: readonly DecisionKind[] = ["user-visible", "internal"];

/**
 * The note a branch must add: `decisions/<branch-name>.md`. A branch name
 * with slashes gives sub-folders, as in `decisions/julian/HAL-118-01.md`.
 */
export function decisionNoteFile(branch: string): string {
  return `decisions/${branch}.md`;
}

/** Parses a decision note in the format above. */
export function parseDecisionNote(file: string, text: string): ParsedDecisionNote {
  const lines = text.split(/\r?\n/);
  const problems: DecisionNoteProblem[] = [];
  const fail = (line: number, message: string): void => {
    problems.push({ line, message });
  };

  if (!lines[0]?.startsWith("# ")) {
    fail(1, 'Start the note with a "# " heading that says what is decided.');
  }
  const coversAt = lines.findIndex((line) => line.trim() === "## Covers");
  const header = coversAt === -1 ? lines : lines.slice(0, coversAt);
  const approval = readField(header, "Approval");
  const kind = readField(header, "Kind");
  if (approval === undefined || approval.value === "") {
    fail(1, 'Add "- Approval: <link>" with the link to the Paperclip approval.');
  }
  if (kind === undefined || !kinds.includes(kind.value as DecisionKind)) {
    fail(kind?.line ?? 1, `Add "- Kind: user-visible" or "- Kind: internal" (D13).`);
  }
  const reasonLines = header.filter((line, index) => index > 0 && isProse(line));
  if (reasonLines.length === 0) {
    fail(1, "Say what changes and why, in a paragraph above the Covers list.");
  }
  const covers = coversAt === -1 ? [] : readCovers(lines, coversAt, fail);
  if (coversAt === -1 || covers.length === 0) {
    fail(
      coversAt === -1 ? lines.length : coversAt + 1,
      'List what the note covers under "## Covers": one requirement ID or repo path per "- " line.',
    );
  }
  if (problems.length > 0 || approval === undefined || kind === undefined) {
    return { ok: false, problems };
  }
  return {
    ok: true,
    note: { file, approval: approval.value, kind: kind.value as DecisionKind, covers },
  };
}

function readField(
  lines: readonly string[],
  name: string,
): { value: string; line: number } | undefined {
  const prefix = `- ${name}:`;
  const index = lines.findIndex((line) => line.startsWith(prefix));
  if (index === -1) {
    return undefined;
  }
  return { value: (lines[index] ?? "").slice(prefix.length).trim(), line: index + 1 };
}

function isProse(line: string): boolean {
  const trimmed = line.trim();
  return trimmed !== "" && !trimmed.startsWith("- ") && !trimmed.startsWith("#");
}

/** The `- ` items under `## Covers`, without backticks, up to the next heading. */
function readCovers(
  lines: readonly string[],
  coversAt: number,
  fail: (line: number, message: string) => void,
): string[] {
  const covers: string[] = [];
  for (let index = coversAt + 1; index < lines.length; index++) {
    const line = (lines[index] ?? "").trim();
    if (line.startsWith("#")) {
      break;
    }
    if (line === "") {
      continue;
    }
    const entry = line.startsWith("- ") ? line.slice(2).trim().replaceAll("`", "") : "";
    if (entry === "" || /\s/.test(entry)) {
      fail(index + 1, `Write one requirement ID or repo path per "- " line, nothing else.`);
      continue;
    }
    covers.push(entry);
  }
  return covers;
}
