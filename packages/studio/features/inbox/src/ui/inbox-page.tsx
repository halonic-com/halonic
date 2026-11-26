import type { AgentMessaging } from "@halonicjs/ports";
import { AccountMenuHostService } from "@halonicjs/studio-feature-account-menu/api";
import {
  ActionCatalogService,
  defaultRequesterPolicy,
  emptyActionCatalog,
  type RequesterPolicy,
  RequesterPolicyService,
  type StepperCatalog,
} from "@halonicjs/studio-feature-action-steppers/api";
import { type RunsList, RunsListService } from "@halonicjs/studio-feature-runs/api";
import { EmptyState, List, useNarrow, usePresentation } from "@halonicjs/studio-kit";
import {
  type ActionSteps,
  AgentMessagingService,
  actionStepsKey,
  desktopOnlyActionSteps,
} from "@halonicjs/studio-services";
import {
  type EngineWords,
  engineWords,
  engineWordsOf,
  type ItemRef,
  type OpenItemOptions,
  type PlaceViewProps,
} from "@halonicjs/studio-shell";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { flushSync } from "react-dom";
import {
  InboxNoticesService,
  InboxRequestsService,
  InboxService,
  ProposalDecisionsService,
} from "../api.ts";
import type { Inbox } from "../inbox.ts";
import { waits } from "../inbox-count.ts";
import type { InboxItem } from "../inbox-items.ts";
import type { InboxNotices } from "../notices/inbox-notices.ts";
import { mergeNotices } from "../notices/merge-notices.ts";
import type { ProposalDecisions } from "../proposal-decisions.ts";
import type { InboxRequests } from "../request/inbox-requests.ts";
import { DoneSection } from "./done-proposals.tsx";
import {
  ItemPageBar,
  itemPaneClass,
  ListHeader,
  listPaneClass,
  needsYouCount,
  nextItem,
  placeOf,
} from "./inbox-page-parts.tsx";
import { countDetail, inboxRow, lateCount } from "./inbox-row.tsx";
import { type InboxMotion, kitMotion, useGlidingState } from "./list-motion.ts";
import { failureReason, isSignedOut, loadFailed, StaleLine } from "./load-lines.tsx";
import { needsYouListed } from "./needs-you-listed.ts";
import { NothingOpen, nothingWaiting } from "./nothing-open.tsx";
import { NoticesSection } from "./notices-section.tsx";
import { OpenCard } from "./open-card.tsx";
import { ProposalsElsewhere } from "./proposals-elsewhere.tsx";
import { itemMark } from "./row-marks.tsx";
import type { RunFactsOf } from "./run-facts.ts";
import { type AgentItems, useAgentItems } from "./use-agent-items.tsx";
import { useOpenItem } from "./use-open-item.ts";
import { useProjectFilter } from "./use-project-filter.tsx";
import { useRequestPane } from "./use-request-pane.tsx";
import { useRunFacts } from "./use-run-facts.ts";
import { useRunReview } from "./use-run-review.ts";
import { useSeeUsage } from "./use-see-usage.ts";
import { useSentRequestCard } from "./use-sent-request-card.ts";
import { useSettleLeftOver } from "./use-settle-left-over.ts";
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
  const seeUsage = useSeeUsage(context.services.find(AccountMenuHostService));
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
      agentMessaging={context.services.find(AgentMessagingService)}
      actionCatalog={context.services.find(ActionCatalogService)}
      requesterPolicy={context.services.find(RequesterPolicyService)}
      actionSteps={context.services.find(actionStepsKey)}
      notices={notices}
      {...(context.runCommand === undefined
        ? {}
        : {
            openNewConnector: () => context.runCommand?.(newConnectorCommand),
            openBudget: () => context.runCommand?.(openBudgetCommand),
          })}
      trust={trust}
      seeUsage={seeUsage}
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
  readonly openPage?: ((item: ItemRef, options?: OpenItemOptions) => void) | undefined;
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
  /**
   * The installed catalog an agent's action request is checked against when it opens. Without it
   * nothing is in the catalog, so every request shows as a card Halonic can't read.
   */
  readonly actionCatalog?: StepperCatalog | undefined;
  /** The user's requester policy. Without it the default holds: only routine requests may run. */
  readonly requesterPolicy?: RequesterPolicy | undefined;
  /** Runs an action request's steps; without it, as in a browser, requests can only be reviewed. */
  readonly actionSteps?: ActionSteps | undefined;
  /** The workspace's runs: a phone's request sheet stops waiting when the run it started ends. */
  readonly runs?: RunsList | undefined;
  /** Says a line where a screen reader hears it: "New in Needs you: …" for a sent request's card that didn't open. */
  readonly announce?: ((line: string) => void) | undefined;
  /** The agents' cards and questions, listed after the Inbox's own items; without it there are none. */
  readonly agentMessaging?: AgentMessaging | undefined;
  /** The motions it plays as rows come and go and panes change; tests pass their own. */
  readonly motion?: InboxMotion;
  /** Opens the customer's usage, for **See usage** on a run at a plan limit; without it there's none. */
  readonly seeUsage?: (() => void) | undefined;
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
 * as a page with **Back to Inbox** and, for an item that waits, where it is among them ("1 of 4",
 * HAL-11945 Q12); the top bar already says "Inbox", so the page's own heading is for screen
 * readers only. A window narrower than 900px (`useNarrow`, such as 200 % zoom on a laptop) shows
 * one pane at a time in the same way, with **Back to Inbox** and the request sheet, but keeps the
 * list's visible heading, since it has no phone top bar (HAL-17822).
 *
 * With no card open, the right pane is the request form when the workspace has a workflow with a
 * `start:` block (`InboxRequests`), and **New request** in the header brings it back.
 *
 * Notices (`InboxNotices`) follow Needs you as flat rows with **Open run** and **×**, then the
 * collapsed **Done** heading of settled run proposals (HAL-11945 Q10).
 *
 * Not here yet: the notices' new dot (HAL-1305).
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
  agentMessaging,
  actionCatalog = emptyActionCatalog,
  requesterPolicy = defaultRequesterPolicy,
  actionSteps = desktopOnlyActionSteps,
  motion = kitMotion,
  seeUsage,
}: InboxViewProps) {
  const subscribe = useCallback((listener: () => void) => inbox.subscribe(listener), [inbox]);
  const read = useCallback(() => inbox.state, [inbox]);
  const list = useRef<HTMLDivElement>(null);
  const state = useGlidingState(subscribe, read, list, motion);
  const { open, focus, openItem, openAt } = useOpenItem(inbox, state.items);
  const agent = useAgentItems(agentMessaging, {
    catalog: actionCatalog,
    policy: requesterPolicy,
    steps: actionSteps,
  });
  // An item of the Inbox's own that opens, by hand or on request, takes the pane from an agent's.
  const closeAgent = agent.close;
  useEffect(() => {
    if (open !== null) closeAgent();
  }, [open, closeAgent]);
  const listed = needsYouListed(state.items, state.decided, open, openAt.current);
  const project = useProjectFilter(agent.waitingItems, listed.length > 0);
  const retry = () => void inbox.refresh();
  useSettleLeftOver(state.leftOver, proposals, retry);
  // A list that opens over a failed load checks again at once, so it doesn't say the last poll's
  // failure until the next one (HAL-13801 SO4).
  useEffect(() => {
    if (inbox.state.error !== undefined) void inbox.refresh();
  }, [inbox]);
  const needsYouHeading = useRef<HTMLHeadingElement>(null);
  // Not now and Back to Inbox: the pane empties and focus goes back to the row the item, or the
  // agent's card, was open from.
  const close = () => {
    const row = list.current?.querySelector<HTMLElement>(
      'tr[aria-current="true"] [role="gridcell"]',
    );
    // With one pane the list is hidden until the item closes, and a hidden row can't take focus.
    const render = () =>
      flushSync(() => {
        openItem(null);
        closeAgent();
      });
    paneMotion(listPane.current, render, "back");
    row?.focus();
  };
  const failedFirst = !state.loaded && state.error !== undefined;
  const phone = usePresentation() === "phone";
  // A phone or a narrow window: one pane at a time, the list or the open item (HAL-17822).
  const onePane = useNarrow() || phone;
  // An agent's card takes the pane as the Inbox's own items do (a11y IN1, HAL-18073).
  const anyOpen = open !== null || agent.openKey !== undefined;
  const itemPage = onePane && anyOpen;
  const requestSheetOpen = useRef(false);
  const itemPane = useRef<HTMLDivElement>(null);
  const listPane = useRef<HTMLDivElement>(null);
  // One pane at a time: the pane that comes slides in from where you went (motion 2).
  const paneMotion = (pane: HTMLElement | null, render: () => void, way: "in" | "back") => {
    if (onePane && pane !== null) void motion.swap(pane, render, way);
    else render();
  };
  const waitingOrder = [
    ...state.items.filter(waits).map((item) => ({ key: item.key, items: 1 })),
    ...agent.order,
  ];
  const sentCard = useSentRequestCard({
    items: state.items,
    openItem,
    sheetOpen: requestSheetOpen,
    announce,
  });
  const request = useRequestPane({
    inbox,
    requests,
    phone: onePane,
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
      <div ref={listPane} data-pane="list" className={listPaneClass(onePane, itemPage)}>
        <ListHeader phone={phone} onePane={onePane} newRequest={request.newRequest} />
        <StaleLine
          error={state.loaded ? state.error : undefined}
          words={words}
          age={{ updatedAt: state.updatedAt, now }}
          phone={phone}
          onRetry={() => inbox.refresh()}
        />
        {agent.lines(now())}
        {project.chips}
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
                ...countDetail(needsYouCount(waitingOrder), lateCount(state.items, now())),
              }}
              rows={[
                ...project
                  .own(listed)
                  .map((item) => ({ ...inboxRow(item, now(), runFacts), ...itemMark(item) })),
                ...agent.rows(now(), project.filter),
              ]}
              onOpen={(key) =>
                paneMotion(
                  itemPane.current,
                  () => flushSync(() => openRow(key, agent, listed, openItem)),
                  "in",
                )
              }
              {...currentRow(open?.key ?? agent.openKey)}
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
            <>
              <NoticesSection
                source={notices}
                openRun={openRun}
                openBudget={openBudget}
                onEmptied={() => needsYouHeading.current?.focus()}
                announce={announce}
                words={words}
              />
              <DoneSection
                done={state.done}
                current={open?.key}
                onOpen={openItem}
                error={state.doneError}
                words={words}
                onRetry={retry}
              />
            </>
          )}
        </div>
      </div>
      {request.sheet}
      <div ref={itemPane} data-pane="item" className={itemPaneClass(onePane, anyOpen)}>
        <div className="flex w-full max-w-190 flex-col">
          {anyOpen ? (
            <ItemPageBar
              back={onePane}
              place={placeOf(open?.key ?? agent.openKey, waitingOrder)}
              close={close}
            />
          ) : null}
          {open === null ? (
            agent.card(
              now,
              <NothingOpen loaded={state.loaded} waiting={state.items.length}>
                {request.form}
              </NothingOpen>,
            )
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
              seeUsage={seeUsage}
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

/** Opens a row's item: an agent's in its own card, else the Inbox's own item of that key. */
function openRow(
  key: string,
  agent: AgentItems,
  listed: readonly InboxItem[],
  openItem: (item: InboxItem | null) => void,
): void {
  if (agent.open(key)) openItem(null);
  else openItem(listed.find((item) => item.key === key) ?? null);
}

/** The List's current row, when one is open. */
function currentRow(key: string | undefined): { current?: string } {
  return key === undefined ? {} : { current: key };
}
