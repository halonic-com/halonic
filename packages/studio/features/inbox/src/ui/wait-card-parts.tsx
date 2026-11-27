import { markHiddenName } from "@halonicjs/std";
import { sampleAnswersWord } from "@halonicjs/studio-feature-runs/api";
import { StatusChip } from "@halonicjs/studio-kit";
import { PlainValue } from "./plain-value.tsx";

// The parts of the wait card that say what an answer is about (`inbox.wait-context`, HAL-19395).

/** How the draft reads while the card waits for an answer, by whether it has its own box. */
const liveDraft = {
  framed: "rounded-sm border border-border p-3 text-body",
  plain: "text-body",
};

/**
 * What the run started with as a quote, then the draft, muted in a dashed frame once the card is
 * answered or stale (`inbox.wait-context`). While the card waits the draft has its own box only
 * when `framed`, that is when the step's description is known and its closing words can't be in
 * the draft. Without it, as in the served Studio for now, the draft reads as before.
 */
export function WaitBody({
  quote,
  draft,
  live,
  framed,
}: {
  readonly quote: string | undefined;
  readonly draft: string;
  readonly live: boolean;
  readonly framed: boolean;
}) {
  const liveClasses = framed ? liveDraft.framed : liveDraft.plain;
  return (
    <>
      {quote === undefined ? null : (
        // Quieter than the draft: the draft is what you approve, the email is its context.
        <blockquote className="border-s-2 border-border-strong ps-3 text-body text-fg-muted">
          <PlainValue text={quote} />
        </blockquote>
      )}
      {draft === "" ? null : (
        <div
          data-draft=""
          className={
            live ? liveClasses : "rounded-sm border border-dashed border-border p-3 text-fg-muted"
          }
        >
          <PlainValue text={draft} />
        </div>
      )}
    </>
  );
}

/** Whether {@link MetaLine} has anything to say: the workflow, the chip, or both. */
export function showsMetaLine(workflow: string | undefined, sample: boolean): boolean {
  return workflow !== undefined || sample;
}

/**
 * The line above the title: the run's workflow, then the "Sample answers" chip when the test model
 * wrote its answers (`runs.sample-chip`), read "Support reply · Sample answers" as the CLI prints
 * it (`inbox.wait-context`). Nothing when neither is known. The title names it with
 * `aria-describedby`, so a screen reader reads it as the title takes focus.
 */
export function MetaLine({
  id,
  workflow,
  sample,
}: {
  readonly id: string;
  readonly workflow: string | undefined;
  readonly sample: boolean;
}) {
  if (!showsMetaLine(workflow, sample)) return null;
  return (
    <p id={id} className="flex flex-wrap items-center gap-x-1 text-small text-fg-muted">
      {workflow === undefined ? null : <span>{markHiddenName(workflow)}</span>}
      {/* The spaces keep its text "Support reply · Sample answers" for a screen reader. */}
      {workflow !== undefined && sample ? " · " : null}
      {sample ? <StatusChip tone="outline">{sampleAnswersWord}</StatusChip> : null}
    </p>
  );
}

/**
 * The step's closing words above its answers, such as "Approving finishes the run. Nothing is sent.".
 * They come from the workflow, so hidden characters show as markers in their own direction
 * (`inbox.plain-values`).
 */
export function Caption({ note }: { readonly note: string | null }) {
  return note === null ? null : (
    <p dir="auto" className="text-small text-fg-muted">
      {markHiddenName(note)}
    </p>
  );
}
