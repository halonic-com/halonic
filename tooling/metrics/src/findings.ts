/**
 * Counts review findings by severity tag, as `docs/guides/review.md` asks
 * reviewers to write them: one finding per line, starting with the tag.
 */

export const severities = ["blocker", "major", "minor", "nit"] as const;

export type Severity = (typeof severities)[number];

export type FindingCount = Readonly<Record<Severity, number>>;

export const noFindings: FindingCount = { blocker: 0, major: 0, minor: 0, nit: 0 };

// After optional indent and a list marker ("-", "*", "+", "1.", "1)"), the
// tag, optionally in bold, followed by a space or the end of the line.
const tagLine = /^\s*(?:(?:[-*+]|\d+[.)])\s+)?(\*\*)?\[(blocker|major|minor|nit)\]\1(?:\s|$)/i;
const fence = /^\s*(```|~~~)/;
const quote = /^\s*>/;

/** The severity of a finding line, or undefined when the line is no finding. */
export function severityOf(line: string): Severity | undefined {
  const match = tagLine.exec(line);
  return match === null ? undefined : (match[2]?.toLowerCase() as Severity);
}

/** Counts the tagged lines of one comment, leaving out quotes and code blocks. */
export function findingsIn(text: string): FindingCount {
  const count = { ...noFindings };
  let fenceMarker: string | undefined;
  for (const line of text.split(/\r?\n/)) {
    const fenceMatch = fence.exec(line);
    if (fenceMatch !== null) {
      if (fenceMarker === undefined) {
        fenceMarker = fenceMatch[1];
      } else if (fenceMarker === fenceMatch[1]) {
        fenceMarker = undefined;
      }
      continue;
    }
    if (fenceMarker !== undefined || quote.test(line)) {
      continue;
    }
    const severity = severityOf(line);
    if (severity !== undefined) {
      count[severity] += 1;
    }
  }
  return count;
}

/** Adds counts up. */
export function addCounts(...counts: readonly FindingCount[]): FindingCount {
  const sum = { ...noFindings };
  for (const count of counts) {
    for (const severity of severities) {
      sum[severity] += count[severity];
    }
  }
  return sum;
}

/** The findings of one pull request, with what identifies it in a report. */
export interface PullRequestFindings {
  readonly number: number;
  readonly title: string;
  readonly mergedAt: string;
  readonly findings: FindingCount;
}

function total(count: FindingCount): number {
  return severities.reduce((sum, severity) => sum + count[severity], 0);
}

function cells(count: FindingCount): string {
  return [...severities.map((severity) => count[severity]), total(count)].join(" | ");
}

/** A Markdown table with one row per pull request and a total row. */
export function findingsTable(rows: readonly PullRequestFindings[]): string {
  const header = `| PR | merged | ${severities.join(" | ")} | total |`;
  const separator = `|---|---|${severities.map(() => "---:").join("|")}|---:|`;
  const lines = rows.map(
    (row) => `| #${row.number} | ${row.mergedAt.slice(0, 10)} | ${cells(row.findings)} |`,
  );
  const sum = addCounts(...rows.map((row) => row.findings));
  return [header, separator, ...lines, `| **${rows.length} PRs** | | ${cells(sum)} |`].join("\n");
}
