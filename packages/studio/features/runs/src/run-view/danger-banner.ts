import type { RunSummary } from "@halonicjs/events";
import { runPageWords } from "../run-words.ts";
import type { RunBanner } from "./run-page-model.ts";

/** The buttons a failed run's banner may carry around **Run again**. */
export type DangerButtons = Pick<
  Extract<RunBanner, { kind: "callout" }>,
  "fixes" | "links" | "details" | "noRunAgain"
>;

/** A failed run's banner: its lines, and the buttons that mend the cause around **Run again**. */
export function danger(lines: readonly string[], buttons: DangerButtons = {}): RunBanner {
  return { kind: "callout", tone: "danger", name: runPageWords.failedName, lines, ...buttons };
}

/**
 * F6 and F21: **Run again** · link **Copy details**. Nothing in Studio fixes the cause, and Copy
 * details carries the engine's or the program's own message, which never shows on screen.
 */
export function withDetails(
  line: string,
  summary: RunSummary,
  buttons: Pick<DangerButtons, "noRunAgain"> = {},
): RunBanner {
  const message = summary.error?.trim() ?? "";
  return danger([line], {
    details: [line, `Run ${summary.id}`, message].filter((part) => part !== "").join("\n"),
    ...buttons,
  });
}
