import { type RunsSource, useRunModelPath } from "@halonicjs/studio-feature-runs/api";
import type { EngineWords, ItemRef, OpenItemOptions } from "@halonicjs/studio-shell";
import { useEffect, useState } from "react";
import type { Inbox } from "../inbox.ts";
import type { InboxItem } from "../inbox-items.ts";
import { secretTarget } from "../plain/secret-target.ts";
import type { ProposalDecisions } from "../proposal-decisions.ts";
import type { SetupFocus } from "../setup-source.ts";
import { ApprovalCard } from "./approval-card.tsx";
import type { NextItem } from "./decided-bar.tsx";
import { DoneProposalCard } from "./done-proposals.tsx";
import { PlanLimitCard } from "./plan-limit-card.tsx";
import { ProposalCard } from "./proposal-card.tsx";
import type { RunFactsOf } from "./run-facts.ts";
import { SetupPane } from "./setup-pane.tsx";
import { WaitCard } from "./wait-card.tsx";
import type { TrustReview } from "./workspace-trust.ts";

/** What {@link OpenCard} shows the open item with. */
export interface OpenCardProps {
  readonly item: InboxItem;
  readonly inbox: Inbox;
  /** Everything waiting, to find the account a pasted secret belongs to. */
  readonly items: readonly InboxItem[];
  readonly focus: SetupFocus | undefined;
  readonly openNewConnector: (() => void) | undefined;
  readonly proposals: ProposalDecisions | undefined;
  readonly openRun: ((hubId: string, runId: string) => void) | undefined;
  readonly trust: TrustReview | undefined;
  readonly openPage: ((item: ItemRef, options?: OpenItemOptions) => void) | undefined;
  readonly runFacts: RunFactsOf | undefined;
  /** The runs' source, to tell a run on Sample answers; without it no card carries that chip. */
  readonly runsSource: RunsSource | undefined;
  /** Opens the customer's usage, for **See usage** on a run at a plan limit; without it there's none. */
  readonly seeUsage?: (() => void) | undefined;
  readonly announce: ((line: string) => void) | undefined;
  readonly next: NextItem | null;
  readonly now: () => Date;
  readonly answering: boolean;
  readonly signedOut: boolean;
  readonly words: EngineWords;
  readonly close: () => void;
}

/**
 * The open item's card in the Inbox's item pane: a setup item's view, a run proposal's page (or
 * its read-only summary once done), an approval's card, a wait step's card or the card of a run
 * waiting at a plan limit.
 */
export function OpenCard({
  item,
  inbox,
  next,
  now,
  answering,
  signedOut,
  words,
  close,
  items,
  focus,
  openNewConnector,
  proposals,
  openRun,
  trust,
  openPage,
  runFacts,
  runsSource,
  seeUsage,
  announce,
}: OpenCardProps) {
  // A note set aside for a secret comes back with the card, once. It is read while rendering and
  // removed in an effect, so a render React throws away doesn't lose it.
  const [aside] = useState(() => inbox.peekAside(item.key));
  useEffect(() => {
    inbox.takeAside(item.key);
  }, [inbox, item.key]);
  const facts = item.kind === "setup" ? undefined : runFacts?.(item.runId);
  // Read each time the card opens: a waiting run may still call a model once it is answered.
  const modelPath = useRunModelPath(
    item.kind === "wait" ? runsSource : undefined,
    item.kind === "wait" ? item.runId : undefined,
  );
  // Open run needs the run's hub, which the Runs list gives; without it the card has no button.
  const openThisRun =
    openRun === undefined || facts === undefined
      ? undefined
      : (runId: string) => openRun(facts.hubId, runId);
  const target = secretTarget("google", items);
  // With no account to set up and no place to open, the button would do nothing, so it isn't offered.
  const somewhereToGo = target.kind === "setup" || openNewConnector !== undefined;
  const goToSecret = (note: string) => {
    inbox.setAside(item.key, note);
    if (target.kind === "setup") {
      inbox.openSetup(target.provider, target.account, "secret");
      return;
    }
    // With no account to set up, the secret goes in a connector: Library > **New connector**.
    openNewConnector?.();
  };
  if (item.kind === "setup") {
    return (
      <SetupPane
        item={item}
        source={inbox.setupSource(item.provider)}
        answering={answering}
        signedOut={signedOut}
        words={words}
        close={close}
        focus={focus}
        openRun={openRun}
        openItem={openPage}
        announce={announce}
      />
    );
  }
  if (item.kind === "proposal" && item.settledAt !== undefined) {
    return <DoneProposalCard item={item} now={now()} facts={facts} onOpenRun={openThisRun} />;
  }
  if (item.kind === "proposal") {
    return (
      <ProposalCard
        item={item}
        now={now()}
        facts={facts}
        decisions={proposals}
        onDecided={() => void inbox.refresh()}
        readAgain={async () => {
          await inbox.refresh();
          if (inbox.state.error !== undefined) throw inbox.state.error;
        }}
        onOpenRun={openThisRun}
        trust={trust}
        answering={answering}
        signedOut={signedOut}
        words={words}
      />
    );
  }
  if (item.kind === "approval") {
    return (
      <ApprovalCard
        item={item}
        agentName={item.agentName}
        subagentName={item.subagentName}
        decisions={inbox.decisions}
        onOpenRun={openThisRun}
        startedBy={facts?.startedBy}
        next={next}
        back={null}
        now={now}
        initialNote={aside}
        answering={answering}
        signedOut={signedOut}
        words={words}
        {...(somewhereToGo ? { onGoToSecret: goToSecret } : {})}
        secretPlace={target.kind}
        trust={trust}
      />
    );
  }
  if (item.limit !== undefined) {
    return (
      <PlanLimitCard
        item={{ ...item, limit: item.limit }}
        decisions={inbox.decisions}
        onOpenRun={openThisRun}
        startedBy={facts?.startedBy}
        onSeeUsage={seeUsage}
        announce={announce}
        next={next}
        now={now}
        answering={answering}
        signedOut={signedOut}
        words={words}
        waiting={items.some((waiting) => waiting.key === item.key)}
      />
    );
  }
  return (
    <WaitCard
      item={item}
      decisions={inbox.decisions}
      onOpenRun={openThisRun}
      startedBy={facts?.startedBy}
      next={next}
      back={null}
      now={now}
      answering={answering}
      signedOut={signedOut}
      words={words}
      waiting={items.some((waiting) => waiting.key === item.key)}
      trust={trust}
      answeredViews={{ inbox, close, openItem: openPage }}
      sample={modelPath === "sample"}
    />
  );
}
