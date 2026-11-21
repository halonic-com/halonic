import { Callout } from "@halonicjs/studio-kit";
import { configurationWords } from "../configuration/configuration-words.ts";
import type { ProblemRow } from "../configuration/problem-lines.ts";

/** The id of a problem's sentence in the Callout, for the field it is about to be described by. */
export function problemSentenceId(calloutId: string, index: number): string {
  return `${calloutId}-${index}`;
}

/**
 * The id of the sentence that says the step's agent is missing (`unknown-agent`), which the Agent
 * field is described by; `undefined` when the step has no such problem.
 */
export function missingAgentSentence(
  rows: readonly ProblemRow[],
  calloutId: string,
): string | undefined {
  const index = rows.findIndex((row) => row.code === "unknown-agent");
  return index < 0 ? undefined : problemSentenceId(calloutId, index);
}

/**
 * The step's problems at the top of its docked card (`workflows.page.docked-card-problems`), in
 * the words of Configuration › Problems: the full message, with "Did you mean …" where the core
 * guesses. In danger when any is an error, else in attention, as the card on the canvas. Several
 * are a list, errors first, each after its glyph, so a warning in a danger box still says what it
 * is. Each sentence has an id, so the field a problem is about can be described by it.
 */
export function StepProblemsCallout({
  id,
  rows,
}: {
  readonly id: string;
  readonly rows: readonly ProblemRow[];
}) {
  const [only] = rows;
  if (only === undefined) return null;
  const tone = rows.some((row) => row.severity === "error") ? "danger" : "attention";
  return (
    <Callout tone={tone}>
      {rows.length === 1 ? (
        <p>
          <ProblemSentence id={problemSentenceId(id, 0)} row={only} />
        </p>
      ) : (
        <ul className="list-none">
          {rows.map((row, index) => (
            // Two rows can say the same thing; the index is the row's place, errors first.
            <li key={index}>
              <span aria-hidden="true">{`${row.glyph} `}</span>
              <ProblemSentence id={problemSentenceId(id, index)} row={row} />
            </li>
          ))}
        </ul>
      )}
    </Callout>
  );
}

/** "Error: " for a screen reader, then the sentence, which alone carries the id. */
function ProblemSentence({ id, row }: { readonly id: string; readonly row: ProblemRow }) {
  return (
    <>
      <span className="sr-only">{configurationWords[row.severity]}: </span>
      <span id={id}>{row.text}</span>
    </>
  );
}
