// The rows of the run page's Details column (checklist part 1, 1.11), worked
// out from the run's summary. Ran on comes from the log's `run.started`, so
// the page draws that row itself.

import type { RunSummary } from "@halonicjs/events";
import type { RunRoutine, SourcedRun } from "../api.ts";
import { costParts, startedBy } from "../list/run-row.ts";
import { detailsWords } from "../run-words.ts";
import { tookWords } from "../time-words.ts";
import { type RunPageContext, startedWords } from "./run-page-model.ts";

/** One label and value of Details. */
export interface DetailRow {
  readonly label: string;
  readonly value: string;
  /** For Started by on a routine's run: the routine's name. */
  readonly tooltip?: string;
}

/** The lead-in of the cost part, which the row's own label says. */
const costLead = "estimated cost ";

/**
 * The Details rows before Ran on: Started by, Started, Took, Model calls and
 * tokens, and Estimated cost. Took is left out while the run is live. A run
 * with no model call says "None" and has no Estimated cost; a run whose calls
 * were all free (a local model, the test model) has none either, never "€0.00".
 *
 * @example
 * detailRows(run, context, undefined);
 * // [{ label: "Started by", value: "You, with Run" }, { label: "Started", value: "today 10:40" }, …]
 */
export function detailRows(
  run: SourcedRun,
  context: RunPageContext,
  routine: RunRoutine | undefined,
): DetailRow[] {
  const { summary } = run;
  const started = startedBy(run, routine);
  const cost = costParts(summary, context.currency)[0];
  return [
    {
      label: detailsWords.startedBy,
      value: started.words,
      ...(started.tooltip === undefined ? {} : { tooltip: started.tooltip }),
    },
    { label: detailsWords.started, value: startedWords(new Date(summary.startedAt), context.now) },
    ...(summary.endedAt === null
      ? []
      : [
          {
            label: detailsWords.took,
            value: tookWords(Date.parse(summary.endedAt) - Date.parse(summary.startedAt)),
          },
        ]),
    { label: detailsWords.modelCalls, value: modelCalls(summary) },
    ...(cost === undefined ? [] : [{ label: detailsWords.estimatedCost, value: costValue(cost) }]),
  ];
}

const tokens = new Intl.NumberFormat("en-US");

function modelCalls(summary: RunSummary): string {
  const { inputTokens, outputTokens } = summary.usage;
  return inputTokens + outputTokens === 0
    ? detailsWords.noModelCalls
    : detailsWords.tokens(tokens.format(inputTokens), tokens.format(outputTokens));
}

/** "€0.03" for the cost part "estimated cost €0.03"; "3 calls without a price" stays, capitalised. */
function costValue(part: string): string {
  return part.startsWith(costLead)
    ? part.slice(costLead.length)
    : part.charAt(0).toUpperCase() + part.slice(1);
}
