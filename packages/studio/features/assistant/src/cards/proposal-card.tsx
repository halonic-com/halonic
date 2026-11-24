import type { FileReview } from "@halonicjs/app";
import { Button, Disclosure, StatusChip, useToastStore } from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { AssistantHostService } from "../api.ts";
import { CardEndLine, cardElementId, endInWords } from "./card-end.tsx";
import { reviewPlaceOf } from "./card-facts.ts";
import { type CardReview, cardReviewsOf, type Proposal } from "./card-reviews.ts";
import { cardWords as words } from "./card-words.ts";

/** The start of the `id` of an open card's **Review**, which the strip's count moves focus to. */
export const cardReviewId = "card-review-";

/** Props for {@link ProposalCard}. */
export interface ProposalCardProps {
  readonly proposal: Proposal;
  /** The model's one sentence on the change. */
  readonly why: string;
  readonly context: WorkspaceContext;
}

/**
 * A change to review in the chat (flow-assistant 3.2): its tag and sentence, its path, the
 * model's why, the diff, and **Review**, **Accept all** and **Reject all** while any of it is left
 * to review. An `article` named by its tag and sentence, with 12px padding inside the 360px panel
 * (component specs 21.2), so it draws the kit Card's box itself. Never green, never "Saved".
 */
export function ProposalCard({ proposal, why, context }: ProposalCardProps) {
  const cards = cardReviewsOf(context.services.get(AssistantHostService));
  const state = useSyncExternalStore(cards.subscribe, () => cards.stateOf(proposal));
  useEffect(() => cards.watch(proposal), [cards, proposal]);
  const decide = useDecide(proposal, state, context);
  const line = useEndFocus(state, decide, context);
  const { facts } = state;
  const nameId = useId();
  const tag = words.tag[facts.tag];
  const end = state.kind === "decided" ? state.end : undefined;
  return (
    <article
      ref={decide.card}
      id={cardElementId({ chatId: proposal.chatId, cardId: proposal.callId })}
      tabIndex={-1}
      aria-label={words.cardName(tag, facts.sentence)}
      className="flex flex-col gap-1 rounded-md border border-border bg-surface p-3 text-body focus-ring"
    >
      <p id={nameId} className="flex flex-wrap items-start gap-x-2 gap-y-1">
        <StatusChip tone="outline">{tag}</StatusChip>
        <span className="text-body-strong">{facts.sentence}</span>
        {facts.important ? <StatusChip tone="outline">{words.important}</StatusChip> : null}
      </p>
      <p className="break-all font-mono text-caption text-fg-muted">{proposal.path}</p>
      {/* A rejected card folds its why away: it keeps only what you turned down. */}
      {why === "" || end?.kind === "rejected" ? null : (
        <p className="text-small text-fg-muted">“{why}”</p>
      )}
      {state.kind === "open" ? (
        <OpenCard
          state={state}
          decide={decide}
          nameId={nameId}
          context={context}
          path={proposal.path}
        />
      ) : null}
      {end?.kind === "accepted" && state.kind === "decided" && state.first !== undefined ? (
        <Disclosure summary={words.showDiff}>
          <Diff review={state.first} />
        </Disclosure>
      ) : null}
      {end === undefined ? null : (
        <CardEndLine end={end} name={facts.name} context={context} line={line} />
      )}
      {state.kind === "failed" ? (
        <>
          <p className="text-small text-danger">{words.cantRead(state.reason)}</p>
          {/* Review needs only the path, and the item bar there has Accept all and Reject all. */}
          <div className="mt-1 flex">
            <Button variant="secondary" size="sm" aria-describedby={nameId} onClick={decide.review}>
              {words.review}
            </Button>
          </div>
        </>
      ) : null}
    </article>
  );
}

type Open = Extract<CardReview, { kind: "open" }>;

function OpenCard({
  state,
  decide,
  nameId,
  context,
  path,
}: {
  readonly state: Open;
  readonly decide: Decide;
  readonly nameId: string;
  readonly context: WorkspaceContext;
  readonly path: string;
}) {
  const { left, total, held } = state;
  const heldId = useId();
  // Deciding on a file that is about to be swapped would be a guess (flow-assistant 3.4).
  const waits = held ? { reason: heldId } : undefined;
  return (
    <>
      {state.latest ? <p className="text-small text-fg-muted">{words.latest}</p> : null}
      <Disclosure summary={words.showDiff}>
        <Diff review={state.review} />
      </Disclosure>
      {left < total ? (
        <p className="text-small text-fg-muted">{words.leftToReview(left, total)}</p>
      ) : null}
      {held ? (
        <p className="flex flex-wrap items-center gap-2 text-small text-warning">
          <span id={heldId}>{words.changedOutside(state.facts.name)}</span>
          {/* Compare is in the file's own view, as on an item page that waits for it. */}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => context.openItem?.({ kind: "file", hub: "workspace", id: path })}
          >
            {words.compare}
          </Button>
        </p>
      ) : null}
      <div className="mt-1 flex flex-wrap gap-2">
        <Button
          id={`${cardReviewId}${nameId}`}
          variant="secondary"
          size="sm"
          aria-describedby={nameId}
          onClick={decide.review}
        >
          {words.review}
        </Button>
        <Button
          variant="primary"
          size="sm"
          aria-describedby={nameId}
          busy={decide.busy === "accept"}
          unavailable={waits}
          onClick={() => decide.run("accept")}
        >
          {words.acceptAll}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          aria-describedby={nameId}
          busy={decide.busy === "reject"}
          unavailable={waits}
          onClick={() => decide.run("reject")}
        >
          {words.rejectAll}
        </Button>
      </div>
    </>
  );
}

/**
 * The card's changes as a unified diff block: removed lines then added ones, each part in order,
 * at most 320px high, then it scrolls. A delete shows one sentence and no lines.
 */
function Diff({ review }: { readonly review: FileReview }) {
  if (review.deleted) return <p className="text-small text-fg-muted">{words.wholeFileDeleted}</p>;
  return (
    <div className="max-h-80 overflow-y-auto rounded-sm border border-border bg-surface-subtle py-1.5 font-mono text-caption">
      {review.parts.map((part, index) => (
        // Parts are worked out again for each read, in file order, so their place is their key.
        <div key={index}>
          {part.removed.map((line, at) => (
            <del
              key={`-${at}`}
              className="block whitespace-pre-wrap break-all bg-danger-soft px-2.5 no-underline"
            >
              <span aria-hidden="true" className="text-danger">
                −{" "}
              </span>
              {withoutNewline(line)}
            </del>
          ))}
          {part.added.map((line, at) => (
            <ins
              key={`+${at}`}
              className="block whitespace-pre-wrap break-all bg-success-soft px-2.5 no-underline"
            >
              <span aria-hidden="true" className="text-success">
                +{" "}
              </span>
              {withoutNewline(line)}
            </ins>
          ))}
        </div>
      ))}
    </div>
  );
}

function withoutNewline(line: string): string {
  return line.endsWith("\n") ? line.slice(0, -1) : line;
}

/**
 * After the card's changes are decided, focus moves to its state line if it was in the card, so a
 * keyboard user isn't sent back to the top of the transcript; otherwise a newer card replacing it
 * is announced (flow-assistant 3.3).
 */
function useEndFocus(
  state: CardReview,
  { card, decidedHere }: Decide,
  context: WorkspaceContext,
): React.RefObject<HTMLDivElement | null> {
  const line = useRef<HTMLDivElement>(null);
  const end = state.kind === "decided" ? state.end : undefined;
  const seen = useRef(end);
  useEffect(() => {
    if (end === undefined || seen.current === end) return;
    seen.current = end;
    const active = document.activeElement;
    const inCard = active !== null && card.current?.contains(active) === true;
    // The clicked button is gone by now, so a decision made here says so itself.
    if (decidedHere.current || inCard) line.current?.focus();
    else if (end.kind === "replaced")
      context.announcer?.announce(endInWords(end, state.facts.name));
    decidedHere.current = false;
  }, [end, card, decidedHere, context, state.facts.name]);
  return line;
}

interface Decide {
  readonly card: React.RefObject<HTMLElement | null>;
  /** A decision on the card itself is running or just ended the card: focus goes to its state line. */
  readonly decidedHere: React.RefObject<boolean>;
  readonly busy: "accept" | "reject" | undefined;
  readonly run: (decision: "accept" | "reject") => void;
  readonly review: () => void;
}

/**
 * Accept all, Reject all and Review. A decision is one step with a toast and **Undo**
 * (flow-assistant 3.4); focus then goes to the card's state line. A failure says so
 * in a danger toast with its reason.
 */
function useDecide(proposal: Proposal, state: CardReview, context: WorkspaceContext): Decide {
  const cards = cardReviewsOf(context.services.get(AssistantHostService));
  const toasts = useToastStore();
  const card = useRef<HTMLElement>(null);
  const decidedHere = useRef(false);
  const [busy, setBusy] = useState<"accept" | "reject">();
  const name = state.facts.name;
  const failed = (title: string, error: unknown) =>
    toasts?.show({
      tone: "danger",
      title,
      text: error instanceof Error ? error.message : String(error),
    });
  const undo = (step: Parameters<typeof cards.undo>[1], doneName: string) =>
    cards.undo(proposal, step).catch((error: unknown) => failed(words.cantUndo(doneName), error));
  const run = async (decision: "accept" | "reject") => {
    if (busy !== undefined) return;
    setBusy(decision);
    decidedHere.current = true;
    try {
      const done = await cards.decide(proposal, decision);
      if (done === undefined) {
        decidedHere.current = false;
        return;
      }
      const said = decision === "accept" ? words.accepted : words.rejected;
      toasts?.show({
        tone: "info",
        title: said(done.count, done.name),
        action: { label: words.undo, onClick: () => void undo(done.step, done.name) },
      });
    } catch (error) {
      decidedHere.current = false;
      failed(decision === "accept" ? words.cantAccept(name) : words.cantReject(name), error);
    } finally {
      setBusy(undefined);
    }
  };
  const review = () => {
    const place = reviewPlaceOf(proposal.path, proposal.content === null);
    if (place.kind === "changes") context.openPlace?.("changes");
    else context.openItem?.(place.item);
  };
  return { card, decidedHere, busy, run: (decision) => void run(decision), review };
}
