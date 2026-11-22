// The run log's words (checklist part 1, 1.10; mc 1.2 and 3.D W-D3): its button and list, and
// "Allow this address?" with its answer as the log says them.

/** Show the run log, and back to the timeline. */
export const runLogWords = {
  show: "Show the run log",
  /** Team decision (HAL-2282): the same button, back to the timeline. */
  hide: "Show every step",
  /** The numbered list's name for screen readers. */
  label: "Run log",
};

/**
 * The question "Allow this address?" as the run log says it (requirement
 * `runs.run-view.key-origin-asked`), in the words of its answer's line: who would send which key
 * where. The address is as it is saved.
 */
export function keyOriginAskedWords(asked: {
  readonly provider: string;
  readonly key: string;
  readonly origin: string;
}): string {
  return `Asked whether provider "${asked.provider}" may send key "${asked.key}" to ${asked.origin}.`;
}

/**
 * A person's answer to "Allow this address?" as the run log says it (HAL-11873 UX checklist,
 * C-20): what was allowed or refused, never who answered. The address is as it is saved.
 */
export function keyOriginAnswerWords(answer: {
  readonly provider: string;
  readonly key: string;
  readonly origin: string;
  readonly answer: "allowed" | "not-allowed";
}): string {
  return answer.answer === "allowed"
    ? `Allowed ${answer.origin} for key "${answer.key}".`
    : `Not allowed: provider "${answer.provider}" can't send key "${answer.key}" to ${answer.origin}.`;
}
