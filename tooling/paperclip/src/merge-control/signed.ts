/**
 * Julian's rule for a signed approval line (HAL-17946): the comment holds
 * exactly one approval line for the reviewer outside code and quotes, and
 * no change request. The line may stand on any line of the comment, after
 * notes, as in the live Merger's gate (#5758, HAL-17927).
 */

/** A reviewer whose signed line the gate reads; Nora's counts only on a routine review (HAL-19283). */
export type Reviewer = "Liam" | "Julian" | "Nora";

/** A change request in words (board, 20 Nov 21:25). */
export const blockWords =
  /(changes requested|request(?:ing|s)? changes|needs? a fix|please fix|(?<!non-)(?<!no )(?<!not )\bblocking\b|do not merge|don't merge)/i;
/** "The blocking point is fixed" is not a change request (#4309). */
export const fixedWords =
  /\bblock(ing|er)\s+(point|issue|comment|finding|item)s?\s+(is|are|was|were|has been|have been)\s+(now\s+)?(fixed|resolved|addressed|gone)/gi;

/** A signed approval: the head it names, and whether it says "re-approved". */
export interface SignedApproval {
  readonly sha: string;
  readonly reapproved: boolean;
  /** The older head named in "(rebase only, range-diff vs `<old>`)". */
  readonly rebaseOf?: string;
}

/** The body without HTML comments, which GitHub doesn't show; an unclosed one runs to the end. */
function withoutHtmlComments(body: string): string {
  return body.replace(/<!--[\s\S]*?(-->|$)/g, (comment) => comment.replace(/[^\n]/g, ""));
}

/** The lines that count: outside fenced code and HTML comments, not indented code, not quoted. */
export function plainLines(body: string): string[] {
  const lines: string[] = [];
  let fence: string | null = null;
  for (const line of withoutHtmlComments(body).split(/\r?\n/)) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1]?.slice(0, 3);
    if (marker !== undefined && (fence === null || fence === marker)) {
      fence = fence === null ? marker : null;
      continue;
    }
    if (fence === null && !/^( {4}|\t)/.test(line) && !/^\s*>/.test(line)) {
      lines.push(line.trimStart());
    }
  }
  return lines;
}

/** Julian's pattern, with the backticks and spacing as loose as the Merger's own matching. */
function approvalLine(reviewer: Reviewer): RegExp {
  return new RegExp(
    `^${reviewer}:[ \\t]*(re-approved|approved(?: again)?) on head[ \\t]*\`?([0-9a-f]{7,40})` +
      `\`?(?:[ \\t]*\\(rebase only, range-diff vs[ \\t]*\`?([0-9a-f]{7,40})\`?\\))?`,
  );
}

/** Whether a plain line of the comment requests changes. */
export function requestsChanges(lines: readonly string[], reviewer: Reviewer): boolean {
  const own = new RegExp(`^${reviewer}: changes requested`, "i");
  return lines.some((line) => own.test(line) || blockWords.test(line.replace(fixedWords, "")));
}

/**
 * The signed approval `reviewer` gives in this comment, or null when it
 * gives none: no approval line, quoted or in code, a change request, or
 * more than one approval line (ambiguous). A comment that opens with its
 * approval line, as reviewers write it, is not read for change words: its
 * findings may say "none blocking" (#6452). The live Merger's gate reads it
 * the same way (HAL-19629).
 */
export function signedApproval(body: string, reviewer: Reviewer): SignedApproval | null {
  const lines = plainLines(body);
  const pattern = approvalLine(reviewer);
  const matches = lines.flatMap((line) => {
    const match = pattern.exec(line);
    return match === null ? [] : [match];
  });
  const only = matches.length === 1 ? matches[0] : undefined;
  if (only === undefined) {
    return null;
  }
  const opensWithIt = lines.find((line) => line.trim() !== "") === only.input;
  if (!opensWithIt && requestsChanges(lines, reviewer)) {
    return null;
  }
  const rebaseOf = only[3];
  return {
    sha: only[2] ?? "",
    reapproved: only[1] === "re-approved",
    ...(rebaseOf === undefined ? {} : { rebaseOf }),
  };
}

/** The approval Liam, Julian or Nora gives in this comment, the first that counts. */
export function anySignedApproval(body: string): SignedApproval | null {
  return (
    signedApproval(body, "Liam") ?? signedApproval(body, "Julian") ?? signedApproval(body, "Nora")
  );
}
