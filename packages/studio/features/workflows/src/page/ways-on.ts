import type { WorkflowView } from "../api.ts";
import { pageWords } from "./page-words.ts";

/**
 * What a step's card says to a screen reader about where the step leads, built from the
 * workflow's arrows in the order they're drawn (a11y check E1):
 *
 * - "Next: Classify it." when no arrow out of it has words;
 * - "Approve: Finished with the reply approved. Reject: Finished without the reply." when they do,
 *   with "Next: …" for an arrow among them that has none;
 * - `undefined` when it leads nowhere, as an end step does.
 *
 * Each step is named as its card shows it: its title, or its id when it has none. An arrow to a
 * step that isn't there isn't drawn, so it isn't read either.
 */
export function waysOnFrom(stepId: string, workflow: WorkflowView): string | undefined {
  const names = new Map(workflow.steps.map((step) => [step.id, step.title ?? step.id]));
  const ways = workflow.arrows.flatMap((arrow) => {
    const target = names.get(arrow.to);
    return arrow.from === stepId && target !== undefined ? [{ label: arrow.label, target }] : [];
  });
  if (ways.length === 0) return undefined;

  const sentences = ways.every((way) => way.label === undefined)
    ? [pageWords.waysOn.next(ways.map((way) => way.target))]
    : ways.map((way) =>
        way.label === undefined
          ? pageWords.waysOn.next([way.target])
          : pageWords.waysOn.labelled(way.label, way.target),
      );
  return sentences.map(endSentence).join(" ");
}

/** Ends a sentence with a full stop, unless a step's title already ended it ("Approve this reply?"). */
function endSentence(sentence: string): string {
  return /[.?!]$/.test(sentence) ? sentence : `${sentence}.`;
}
