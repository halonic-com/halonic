import type { CheckFact } from "../check-facts.ts";
import { checkGlyphs, checkHeading } from "../check-marks.ts";
import { type ReportLine, reportLine } from "./report-lines.ts";

/** What the report says about Halonic and the open workspace, besides the lines. */
export interface ReportHeader {
  /** Halonic's version and the system, as the app gives them: "Halonic 0.1.0 · macOS arm64". */
  readonly about: string;
  readonly at: Date;
  /** Whether the open workspace is the demo, which the Workspace line names instead of its name. */
  readonly demo: boolean;
}

/** The labels are padded to this width, so the facts line up; the facts under the first line up too. */
const labelWidth = 16;

function rows(line: ReportLine): string[] {
  const [first = "", ...rest] = line.facts;
  return [
    `${checkGlyphs[line.mark]} ${line.label.padEnd(labelWidth)}${first}`,
    ...rest.map((fact) => `${" ".repeat(2 + labelWidth)}${fact}`),
  ];
}

/**
 * The plain text **Copy report** puts on the clipboard and **Show the report** shows
 * (requirement `check-computer.report`, first-run-progress 4.3). It is an allow-list, not a
 * clean-up: each line's facts come from named fields only, so no key, file, workspace, step,
 * agent or account name, no error text and no path can get in.
 *
 * @example
 * checkReport(facts, { about: "Halonic 0.1.0 · macOS arm64", at, demo: true });
 * // "Check this computer\nHalonic 0.1.0 · macOS arm64\n2026-11-22 10:42\n1 problem\n\n✓ Engine          running\n…"
 */
export function checkReport(facts: readonly CheckFact[], header: ReportHeader): string {
  const lines = facts.map((fact) => reportLine(fact, header.demo));
  return [
    "Check this computer",
    header.about,
    reportTime(header.at),
    checkHeading(lines.map((line) => line.mark)),
    "",
    ...lines.flatMap(rows),
  ].join("\n");
}

/** The time as "2026-11-22 10:42", the same in every language. */
function reportTime(at: Date): string {
  const two = (value: number) => String(value).padStart(2, "0");
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())} ${two(at.getHours())}:${two(at.getMinutes())}`;
}
