import type { InboxAnswer } from "@halonicjs/ports";
import {
  offerServerSession,
  RunWithClaude,
  type ServerSessionOffer,
} from "@halonicjs/studio-feature-action-steppers/api";
import { useRef } from "react";
import { AgentItemCard, type AgentItemCardProps } from "./agent-item-card.tsx";
import type { ActionChecks } from "./use-action-checks.ts";

/** Props for {@link StepperItemCard}. */
export interface StepperItemCardProps extends AgentItemCardProps {
  readonly checks: ActionChecks;
}

/**
 * How a server session that started is answered: its one block succeeded. The provider writes the
 * task's result from it; a refusal, a cancel or a failure sends nothing and the item stays open.
 */
export const serverSessionStarted: InboxAnswer = {
  kind: "action-result",
  outcome: "succeeded",
  steps: [{ step: 1, outcome: "succeeded" }],
};

/**
 * An agent's stored stepper request (`inbox.run-with-claude`): the agent's card, and under it
 * **Run with Claude** when the request offers a server session for the item's own task, from a
 * source that is a Paperclip the user connected and that their policy allows. A request that
 * offers none, or a card with only a label, keeps the card alone.
 */
export function StepperItemCard({ checks, ...card }: StepperItemCardProps) {
  const { item, source, work, answer } = card;
  const { serverSession } = checks;
  const origin = serverSession.originOf(item.source);
  const offer =
    origin === undefined
      ? undefined
      : offerServerSession(item, source, {
          catalog: checks.catalog,
          policy: checks.policy,
          origin,
          task: work?.label,
        });
  // Once it started here the item is answered and offers nothing more, but the confirm screen
  // keeps saying that Claude Code is starting.
  const started = useRef<ServerSessionOffer | undefined>(undefined);
  const shown = offer ?? started.current;
  const onStarted = () => {
    started.current = shown;
    answer(serverSessionStarted).then(
      (result) => {
        if (result.outcome !== "answered") console.error("The started session's answer", result);
      },
      (error: unknown) => console.error("Couldn't answer the started session", error),
    );
  };
  return (
    <div className="flex flex-col gap-4">
      <AgentItemCard {...card} />
      {shown === undefined ? null : (
        <RunWithClaude
          offer={shown}
          server={serverSession.server}
          shell={serverSession.shell}
          openSettings={serverSession.openSettings}
          onStarted={onStarted}
        />
      )}
    </div>
  );
}
