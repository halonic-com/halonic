import type { AnswerResult, InboxAnswer } from "@halonicjs/ports";
import {
  type ActionItem,
  ActionStepper,
  type RequesterPolicy,
  reviewActionItem,
  reviewOnlyActions,
  type StepperCatalog,
} from "@halonicjs/studio-feature-action-steppers/api";
import { useState } from "react";
import { AgentItemCard, type AgentItemCardProps } from "./agent-item-card.tsx";
import { FailedLine, failureDetailOf } from "./card-parts.tsx";

/** Props for {@link ActionItemCard}. */
export interface ActionItemCardProps extends AgentItemCardProps {
  readonly item: ActionItem;
  /** The installed catalog the request is checked against when it opens. */
  readonly catalog: StepperCatalog;
  /** The user's requester policy, from their profile. */
  readonly policy: RequesterPolicy;
}

/** How a request ends when the user declines it: it never ran, so no step is listed. */
const declined: InboxAnswer = { kind: "action-result", outcome: "declined", steps: [] };

/** Where this card's **Decline** is. */
type Declining =
  | { readonly kind: "idle" }
  | { readonly kind: "sending" }
  | { readonly kind: "declined" }
  | { readonly kind: "failed"; readonly error?: unknown };

function afterDecline(result: AnswerResult): Declining {
  if (result.outcome === "answered") return { kind: "declined" };
  // Answered elsewhere, the item reads as answered once it is read again and says by whom.
  if (result.outcome === "already-answered") return { kind: "idle" };
  return { kind: "failed" };
}

/**
 * An agent's action request (`inbox.agent-action-items`). Each time it opens, the request is
 * checked again against the installed catalog and the user's requester policy. While it waits, it
 * shows the stepper in review mode: what it touches, each step, who asked and why, with
 * **Decline**, and "Blocked by your settings" when the policy doesn't allow it. A request Halonic
 * can't read stays the agent's normal card, with the reasons and only **Decline**; once answered,
 * that card says by whom and how.
 */
export function ActionItemCard({ catalog, policy, ...card }: ActionItemCardProps) {
  const { item, source, now, answer } = card;
  const [declining, setDeclining] = useState<Declining>({ kind: "idle" });
  const review = reviewActionItem(item, source, { catalog, policy, now: now() });
  if (review.kind === "unreadable") return <AgentItemCard {...card} cannotRun={review.reasons} />;
  if (item.state.kind !== "open" && declining.kind !== "declined")
    return <AgentItemCard {...card} />;

  const decline = async () => {
    if (declining.kind === "sending") return;
    setDeclining({ kind: "sending" });
    try {
      setDeclining(afterDecline(await answer(declined)));
    } catch (error) {
      // The line above the stepper says it failed, with the failure's own reason, and Try again declines again.
      setDeclining({ kind: "failed", error });
    }
  };
  const view =
    declining.kind === "declined"
      ? { ...review.view, stage: { kind: "declined" } as const }
      : review.view;
  return (
    <div className="flex flex-col">
      <FailedLine
        onRetry={declining.kind === "failed" ? () => void decline() : null}
        detail={declining.kind === "failed" ? failureDetailOf(declining.error) : null}
      />
      <ActionStepper view={view} actions={reviewOnlyActions(() => void decline())} />
    </div>
  );
}
