import type { CheckContext } from "../lib/context.ts";
import { Report } from "../lib/problems.ts";

const fence = /^\s*(```|~~~)/;
const codeSpan = /(`+)[^`]*?\1/g;
/** An inline link `[text](/HAL/issues/…)` or a reference definition `[text]: /HAL/issues/…`. */
const trackerLink = /\]\(\s*<?\/HAL\/issues\/|^\s{0,3}\[[^\]]+\]:\s*<?\/HAL\/issues\//;

/**
 * Finds the lines (1-based) of Markdown links whose target starts with
 * `/HAL/issues/`. Code blocks and code spans are not links, so they don't
 * count.
 *
 * @example
 * findTrackerLinks("See [HAL-136](/HAL/issues/HAL-136).");
 * // [1]
 */
export function findTrackerLinks(text: string): number[] {
  const lines: number[] = [];
  let inFence = false;
  text.split(/\r?\n/).forEach((line, index) => {
    if (fence.test(line)) {
      inFence = !inFence;
      return;
    }
    if (!inFence && trackerLink.test(line.replace(codeSpan, ""))) {
      lines.push(index + 1);
    }
  });
  return lines;
}

/**
 * Fails on a Markdown link to the task tracker (HAL-7143). Its targets only
 * open for people signed in to the tracker; for everyone else on GitHub or
 * the docs site they are dead links. Task ids stay plain text (`HAL-136`).
 */
export function checkTrackerLinks(context: CheckContext): Report {
  const report = new Report("tracker-links");
  for (const file of context.files.filter((name) => name.endsWith(".md"))) {
    for (const line of findTrackerLinks(context.read(file))) {
      report.error(
        file,
        "This links to the task tracker, which readers outside the team can't open. Write the task id as plain text (HAL-136), and link the requirement or ADR that records the substance if the reader needs it.",
        line,
      );
    }
  }
  return report;
}
