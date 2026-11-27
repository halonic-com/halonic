import type { ConnectionsRead, StepperView } from "@halonicjs/studio-feature-action-steppers/api";
import {
  type ActionItem,
  ActionStepper,
  type RequesterPolicy,
  reviewActionItem,
  type StepperCatalog,
  useStepperRun,
} from "@halonicjs/studio-feature-action-steppers/api";
import type { ActionSteps } from "@halonicjs/studio-services";
import { useEffect, useRef } from "react";
import { AgentItemCard, type AgentItemCardProps } from "./agent-item-card.tsx";
import { FailedLine, failureDetailOf } from "./card-parts.tsx";

/** Props for {@link ActionItemCard}. */
export interface ActionItemCardProps extends AgentItemCardProps {
  readonly item: ActionItem;
  /** The installed catalog the request is checked against when it opens. */
  readonly catalog: StepperCatalog;
  /** The user's requester policy, from their profile. */
  readonly policy: RequesterPolicy;
  /** Runs the request's steps with the user's sign-in; in a browser it runs nothing. */
  readonly steps: ActionSteps;
  /**
   * The connections as this window read them: a Paperclip request runs only on one whose key this
   * computer holds, and waits in review mode while they are still being read.
   */
  readonly paperclips: ConnectionsRead;
}

/**
 * An agent's action request (`inbox.agent-action-items`). Each time it opens, the request is
 * checked again against the installed catalog and the user's requester policy. While it waits, it
 * shows the stepper: in the desktop app the user signs in and runs its steps, and the item is
 * answered when the stepper ends; elsewhere it stays in review mode with **Decline**, and says
 * "Blocked by your settings" when the policy doesn't allow it. A request Halonic can't read stays
 * the agent's normal card, with the reasons and only **Decline**; once answered, that card says
 * by whom and how.
 */
export function ActionItemCard({
  catalog,
  policy,
  steps,
  paperclips,
  ...card
}: ActionItemCardProps) {
  const { item, source, now } = card;
  const review = reviewActionItem(item, source, { catalog, policy, now: now(), paperclips });
  if (review.kind === "unreadable") return <AgentItemCard {...card} cannotRun={review.reasons} />;
  return (
    <ActionRun
      key={`${item.source}/${item.id}`}
      reviewed={review.view}
      card={card}
      catalog={catalog}
      policy={policy}
      steps={steps}
      paperclips={paperclips}
    />
  );
}

interface ActionRunProps {
  readonly reviewed: StepperView;
  readonly card: AgentItemCardProps & { readonly item: ActionItem };
  readonly catalog: StepperCatalog;
  readonly policy: RequesterPolicy;
  readonly steps: ActionSteps;
  readonly paperclips: ConnectionsRead;
}

/** The stepper of one open request, run until it ends; an item answered elsewhere shows as answered. */
function ActionRun({ reviewed, card, catalog, policy, steps, paperclips }: ActionRunProps) {
  const { item, source, now, answer } = card;
  // The run keeps its first options, so it reads the Paperclips through a ref that every draw updates.
  const connected = useRef(paperclips);
  connected.current = paperclips;
  const paperclipsNow = () => connected.current;
  const run = useStepperRun(reviewed, {
    item,
    source,
    catalog,
    policy,
    steps,
    answer,
    now,
    paperclips: paperclipsNow,
  });
  // A request that waited for the connections checks again once they are read, in the same card,
  // so the stepper's heading keeps the focus (`action-steppers.paperclip-host`).
  const { recheck } = run;
  const loading = paperclips.kind === "loading";
  const waited = useRef(loading);
  useEffect(() => {
    if (waited.current && !loading) recheck();
    waited.current = loading;
  }, [loading, recheck]);
  const stage = run.view.stage.kind;
  // Ended here, the stepper keeps saying how; answered by someone else, the card says by whom.
  // It was already open, so its title doesn't take the focus: its line may have, as the stepper went.
  const endedHere = stage === "declined" || stage === "finished";
  if (item.state.kind !== "open" && !endedHere) {
    return <AgentItemCard {...card} focusOnOpen={false} />;
  }
  const failed = run.failure !== undefined;
  return (
    <div className="flex flex-col">
      <FailedLine
        onRetry={failed ? run.retry : null}
        detail={failed ? failureDetailOf(run.failure) : null}
      />
      <ActionStepper view={run.view} actions={run.actions} focusOnOpen={card.focusOnOpen} />
    </div>
  );
}
