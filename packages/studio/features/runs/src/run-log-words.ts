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
 * `runs.run-view.key-origin-asked`): the dialog's name first, so the line matches what the person
 * saw, then who would send which key where, in the words of its answer's line. The address is as
 * it is saved.
 */
export function keyOriginAskedWords(asked: {
  readonly provider: string;
  readonly key: string;
  readonly origin: string;
}): string {
  return `Allow this address? Asked whether provider "${asked.provider}" may send key "${asked.key}" to ${asked.origin}.`;
}

/**
 * A person's answer to "Allow this address?" as the run log says it (HAL-11873 UX checklist,
 * C-20; HAL-15914): what was allowed or refused, never who answered, and for both answers the
 * provider too, so two providers with a key of the same name read apart. The address is as it is
 * saved.
 */
export function keyOriginAnswerWords(answer: {
  readonly provider: string;
  readonly key: string;
  readonly origin: string;
  readonly answer: "allowed" | "not-allowed";
}): string {
  return answer.answer === "allowed"
    ? `Allowed: provider "${answer.provider}" may send key "${answer.key}" to ${answer.origin}.`
    : `Not allowed: provider "${answer.provider}" can't send key "${answer.key}" to ${answer.origin}.`;
}
