import {
  type RunsList,
  RunsListService,
  type RunsSource,
  useRunModelPath,
} from "@halonicjs/studio-feature-runs/api";
import { Button, EmptyState, List, usePresentation } from "@halonicjs/studio-kit";
import {
  type EngineWords,
  engineWords,
  engineWordsOf,
  type ItemRef,
  type PlaceViewProps,
} from "@halonicjs/studio-shell";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import {
  InboxNoticesService,
  InboxRequestsService,
  InboxService,
  ProposalDecisionsService,
} from "../api.ts";
import type { Inbox } from "../inbox.ts";
import { waitingCount } from "../inbox-count.ts";
import type { InboxItem } from "../inbox-items.ts";
import type { InboxNotices } from "../notices/inbox-notices.ts";
import { mergeNotices } from "../notices/merge-notices.ts";
import { secretTarget } from "../plain/secret-target.ts";
import type { ProposalDecisions } from "../proposal-decisions.ts";
import type { InboxRequests } from "../request/inbox-requests.ts";
import type { SetupFocus } from "../setup-source.ts";
import { ApprovalCard } from "./approval-card.tsx";
import type { NextItem } from "./card-parts.tsx";
import { ListHeader, listPaneClass, nextItem } from "./inbox-page-parts.tsx";
import { countDetail, inboxRow, lateCount } from "./inbox-row.tsx";
import { failureReason, isSignedOut, loadFailed, StaleLine } from "./load-lines.tsx";
import { NothingOpen, nothingWaiting } from "./nothing-open.tsx";
import { NoticesSection } from "./notices-section.tsx";
import { ProposalCard } from "./proposal-card.tsx";
import { ProposalsElsewhere } from "./proposals-elsewhere.tsx";
import type { RunFactsOf } from "./run-facts.ts";
import { SetupPane } from "./setup-pane.tsx";
import { useOpenItem } from "./use-open-item.ts";
import { useRequestPane } from "./use-request-pane.tsx";
import { useRunFacts } from "./use-run-facts.ts";
import { useRunReview } from "./use-run-review.ts";
import { useSentRequestCard } from "./use-sent-request-card.ts";
import { WaitCard } from "./wait-card.tsx";
import { type TrustReview, useTrustReview } from "./workspace-trust.ts";

/** The Library's command that opens New connector; the Inbox can't import the Library, so it runs it by id. */
const newConnectorCommand = "library.new-connector";
const openBudgetCommand = "workspace.open-budget";

/** The Inbox place's page: the open workspace's Inbox, from `InboxService`. */
export function InboxPage({ context }: PlaceViewProps) {
  const { openItem } = context;
  const inbox = context.services.get(InboxService);
  const appNotices = context.services.find(InboxNoticesService);
  // The merge keeps one identity per source pair, so the section doesn't reload on every render.
  const notices = useMemo(
    () => mergeNotices(appNotices, inbox.extraNotices),
    [appNotices, inbox.extraNotices],
  );
  const runs = context.services.find(RunsListService);
  const runFacts = useRunFacts(runs);
  const trust = useTrustReview(context);
  // Effects run children first, so the view below already listens for the item this opens.
  useRunReview(inbox, runs);
  return (
    <InboxView
      inbox={inbox}
      runs={runs}
      runFacts={runFacts}
      words={engineWordsOf(context)}
      announce={(line) => context.announcer.announce(line)}
      requests={context.services.find(InboxRequestsService)}
      proposals={context.services.find(ProposalDecisionsService)}
      notices={notices}
      {...(context.runCommand === undefined
        ? {}
        : {
            openNewConnector: () => context.runCommand?.(newConnectorCommand),
            openBudget: () => context.runCommand?.(openBudgetCommand),
          })}
      trust={trust}
      {...(openItem && {
        openRun: (hubId: string, runId: string) => openItem({ kind: "run", hub: hubId, id: runId }),
        openPage: openItem,
      })}
    />
  );
}

/** Props for {@link InboxView}. */
export interface InboxViewProps {
  readonly inbox: Inbox;
  /** The clock for the waiting times; tests pass a fixed one. */
  readonly now?: () => Date;
  /**
   * The engine words for this window's host: said when a load fails with no reason of its own,
   * and over the list when a later load fails (microcopy 10.1). The desktop app's by default.
   */
  readonly words?: EngineWords;
  /** The workflows the Inbox starts as requests; without it there is no request form. */
  readonly requests?: InboxRequests | undefined;
  /** The notices under Needs you; without it there is no Notices section. */
  readonly notices?: InboxNotices | undefined;
  /**
   * Accept and Reject on run proposals, which the app provides only where it lists them; without
   * it Needs you says where proposals show, and a proposal names the command that decides it.
   */
  readonly proposals?: ProposalDecisions | undefined;
  /** Opens New connector, for a secret pasted when no account is there to take it. */
  readonly openNewConnector?: () => void;
  /** Opens Workspace settings at Budget, for **Change budget** on the monthly budget notice and the refused request. */
  readonly openBudget?: (() => void) | undefined;
  /** Opens a run's page, for **Open run** on the toast that says a request started. */
  readonly openRun?: ((hubId: string, runId: string) => void) | undefined;
  /** Opens an item's page, for a setup item's own buttons, such as the first run's **Continue**. */
  readonly openPage?: ((item: ItemRef) => void) | undefined;
  /**
   * The workspace's trust, for a card whose answer was refused because the workspace isn't
   * trusted: **Review**, and the line goes once it is. Without it that line has no button.
   */
  readonly trust?: TrustReview | undefined;
  /**
   * The workflow and starter of a run: the row says the workflow, and the card says what started
   * the run and has **Open run** (with `openRun`). Without it the Inbox says neither.
   */
  readonly runFacts?: RunFactsOf | undefined;
  /** The workspace's runs: a phone's request sheet stops waiting when the run it started ends. */
  readonly runs?: RunsList | undefined;
  /** Says a line where a screen reader hears it: "New in Needs you: …" for a sent request's card that didn't open. */
  readonly announce?: ((line: string) => void) | undefined;
}

/**
 * The Inbox (flow-inbox 3.1, UX checklist 2.1, 2.3, 2.9 and 2.10): "Inbox", then Needs you, a
 * grid of what waits for you, setup items first, then newest first, with its count in the heading
 * ("Needs you, 2 waiting"), beside the open item's card. Nothing is open at first, unless Home's Needs you asked
 * for an item (`Inbox.requestOpen`) or a run's **Review in Inbox** for what the run waits on. Enter or a click opens a
 * row's card, which takes focus; once decided, the card stays, with **Next** to the next item.
 *
 * A setup item opens its source's view (`SetupPane`); **Not now** and Escape close it and put
 * focus back on its row.
 *
 * On a phone (HAL-8778, phone layout 5) the list is the whole page, and an open item replaces it
 * as a page with **Back to Inbox**; the top bar already says "Inbox", so the page's own heading is
 * for screen readers only.
 *
 * With no card open, the right pane is the request form when the workspace has a workflow with a
 * `start:` block (`InboxRequests`), and **New request** in the header brings it back.
 *
 * Notices (`InboxNotices`) follow Needs you as flat rows with **Open run** and **×**.
 *
 * Not here yet: the notices' new dot and the narrow layout (HAL-1305).
 */
export function InboxView({
  inbox,
  now = () => new Date(),
  words = engineWords["desktop-app"],
  requests,
  notices,
  proposals,
  openNewConnector,
  openBudget,
  openRun,
  trust,
  openPage,
  runFacts,
  runs,
  announce,
}: InboxViewProps) {
  const subscribe = useCallback((listener: () => void) => inbox.subscribe(listener), [inbox]);
  const state = useSyncExternalStore(subscribe, () => inbox.state);
  const { open, focus, openItem, openAt } = useOpenItem(inbox, state.items);
  const retry = () => void inbox.refresh();
  // A list that opens over a failed load checks again at once, so it doesn't say the last poll's
  // failure until the next one (HAL-13801 SO4).
  useEffect(() => {
    if (inbox.state.error !== undefined) void inbox.refresh();
  }, [inbox]);
  const list = useRef<HTMLDivElement>(null);
  const needsYouHeading = useRef<HTMLHeadingElement>(null);
  // Not now: the pane empties and focus goes back to the row the item was open from.
  const close = () => {
    const row = list.current?.querySelector<HTMLElement>(
      'tr[aria-current="true"] [role="gridcell"]',
    );
    // On a phone the list is hidden until the item closes, and a hidden row can't take focus.
    flushSync(() => openItem(null));
    row?.focus();
  };
  const failedFirst = !state.loaded && state.error !== undefined;
  const phone = usePresentation() === "phone";
  const itemPage = phone && open !== null;
  const requestSheetOpen = useRef(false);
  const itemPane = useRef<HTMLDivElement>(null);
  const sentCard = useSentRequestCard({
    items: state.items,
    openItem,
    sheetOpen: requestSheetOpen,
    announce,
  });
  const request = useRequestPane({
    inbox,
    requests,
    phone,
    list,
    closeItem: () => openItem(null),
    words,
    openRun,
    openBudget,
    onStarted: sentCard.watch,
    sheetOpen: requestSheetOpen,
    cardOpen: open !== null,
    focusCard: () => itemPane.current?.querySelector<HTMLElement>("section h2[tabindex]")?.focus(),
    runs,
  });

  return (
    <div className="flex h-full min-h-0 w-full">
      <div data-pane="list" className={listPaneClass(phone, itemPage)}>
        <ListHeader phone={phone} newRequest={request.newRequest} />
        <StaleLine error={state.loaded ? state.error : undefined} words={words} phone={phone} />
        <div ref={list} className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {failedFirst ? (
            <EmptyState
              tone="error"
              align="start"
              title={loadFailed}
              description={failureReason(state.error, words)}
              action={{ label: "Try again", onClick: retry }}
            />
          ) : (
            <List
              heading={{
                name: "Needs you",
                headingRef: needsYouHeading,
                ...countDetail(waitingCount(state.items), lateCount(state.items, now())),
              }}
              rows={state.items.map((item) => inboxRow(item, now(), runFacts))}
              onOpen={(key) => openItem(state.items.find((item) => item.key === key) ?? null)}
              {...(open === null ? {} : { current: open.key })}
              empty={
                phone
                  ? { title: nothingWaiting.title, description: nothingWaiting.description }
                  : { title: "Nothing is waiting for you.", plain: true }
              }
              // The loading skeleton's heading takes no headingRef, so a last-notice dismiss during a
              // refresh can't move focus to it. Known and accepted.
              loading={!state.loaded}
              loadingLabel="Loading the Inbox"
              onRetry={retry}
            />
          )}
          {state.loaded && !failedFirst && proposals === undefined ? <ProposalsElsewhere /> : null}
          {failedFirst ? null : (
            <NoticesSection
              source={notices}
              openRun={openRun}
              openBudget={openBudget}
              onEmptied={() => needsYouHeading.current?.focus()}
              announce={announce}
              words={words}
            />
          )}
        </div>
      </div>
      {request.sheet}
      <div
        ref={itemPane}
        data-pane="item"
        className={`${phone && open === null ? "hidden" : "flex"} min-w-0 flex-1 justify-center overflow-y-auto`}
      >
        <div className="flex w-full max-w-190 flex-col">
          {itemPage ? (
            <div className="px-2 pt-2">
              <Button variant="ghost" size="touch" onClick={close}>
                Back to Inbox
              </Button>
            </div>
          ) : null}
          {open === null ? (
            <NothingOpen loaded={state.loaded} waiting={state.items.length}>
              {request.form}
            </NothingOpen>
          ) : (
            <OpenCard
              key={open.key}
              item={open}
              inbox={inbox}
              next={nextItem(state.items, open, openAt.current, openItem)}
              items={state.items}
              focus={focus}
              openNewConnector={openNewConnector}
              proposals={proposals}
              openRun={openRun}
              trust={trust}
              openPage={openPage}
              runFacts={runFacts}
              runsSource={runs?.source}
              announce={announce}
              now={now}
              answering={state.error === undefined}
              signedOut={isSignedOut(state.error)}
              words={words}
              close={close}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function OpenCard({
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
  announce,
}: {
  readonly item: InboxItem;
  readonly inbox: Inbox;
  /** Everything waiting, to find the account a pasted secret belongs to. */
  readonly items: readonly InboxItem[];
  readonly focus: SetupFocus | undefined;
  readonly openNewConnector: (() => void) | undefined;
  readonly proposals: ProposalDecisions | undefined;
  readonly openRun: ((hubId: string, runId: string) => void) | undefined;
  readonly trust: TrustReview | undefined;
  readonly openPage: ((item: ItemRef) => void) | undefined;
  readonly runFacts: RunFactsOf | undefined;
  /** The runs' source, to tell a run on Sample answers; without it no card carries that chip. */
  readonly runsSource: RunsSource | undefined;
  readonly announce: ((line: string) => void) | undefined;
  readonly next: NextItem | null;
  readonly now: () => Date;
  readonly answering: boolean;
  readonly signedOut: boolean;
  readonly words: EngineWords;
  readonly close: () => void;
}) {
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
  if (item.kind === "proposal") {
    return (
      <ProposalCard
        item={item}
        now={now()}
        facts={facts}
        decisions={proposals}
        onDecided={() => void inbox.refresh()}
        onOpenRun={openThisRun}
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
