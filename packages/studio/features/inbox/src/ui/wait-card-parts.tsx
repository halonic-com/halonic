import { markHiddenName } from "@halonicjs/std";
import { sampleAnswersWord } from "@halonicjs/studio-feature-runs/api";
import { StatusChip } from "@halonicjs/studio-kit";
import { PlainValue } from "./plain-value.tsx";

// The parts of the wait card that say what an answer is about (`inbox.wait-context`, HAL-19395).

/**
 * What the run started with as a quote, then the draft in its own box, muted in a dashed frame
 * once the card is answered or stale (`inbox.wait-context`).
 */
export function WaitBody({
  quote,
  draft,
  live,
}: {
  readonly quote: string | undefined;
  readonly draft: string;
  readonly live: boolean;
}) {
  return (
    <>
      {quote === undefined ? null : (
        <blockquote className="border-s-2 border-border ps-3 text-body">
          <PlainValue text={quote} />
        </blockquote>
      )}
      {draft === "" ? null : (
        <div
          data-draft=""
          className={
            live
              ? "rounded-sm border border-border p-3 text-body"
              : "rounded-sm border border-dashed border-border p-3 text-fg-muted"
          }
        >
          <PlainValue text={draft} />
        </div>
      )}
    </>
  );
}

/**
 * The line above the title: the run's workflow, then the "Sample answers" chip when the test model
 * wrote its answers (`runs.sample-chip`), read "Support reply · Sample answers" as the CLI prints
 * it (`inbox.wait-context`). Nothing when neither is known.
 */
export function MetaLine({
  workflow,
  sample,
}: {
  readonly workflow: string | undefined;
  readonly sample: boolean;
}) {
  if (workflow === undefined && !sample) return null;
  return (
    <p className="flex flex-wrap items-center gap-x-1 text-small text-fg-muted">
      {workflow === undefined ? null : <span>{markHiddenName(workflow)}</span>}
      {/* The spaces keep its text "Support reply · Sample answers" for a screen reader. */}
      {workflow !== undefined && sample ? " · " : null}
      {sample ? <StatusChip tone="outline">{sampleAnswersWord}</StatusChip> : null}
    </p>
  );
}

/** The step's closing words above its answers, such as "Approving finishes the run. Nothing is sent.". */
export function Caption({ note }: { readonly note: string | null }) {
  return note === null ? null : <p className="text-small text-fg-muted">{note}</p>;
}
