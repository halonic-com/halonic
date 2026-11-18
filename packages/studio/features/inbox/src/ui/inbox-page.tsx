import { RunsListService } from "@halonicjs/studio-feature-runs/api";
import { Button, EmptyState, List, usePresentation } from "@halonicjs/studio-kit";
import {
  type EngineWords,
  engineWords,
  engineWordsOf,
  errorMessageFor,
  type PlaceViewProps,
} from "@halonicjs/studio-shell";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { flushSync } from "react-dom";
import { InboxNoticesService, InboxRequestsService, InboxService } from "../api.ts";
import type { Inbox, SetupFocus } from "../inbox.ts";
import { waitingCount } from "../inbox-count.ts";
import type { InboxItem } from "../inbox-items.ts";
import type { InboxNotices } from "../notices/inbox-notices.ts";
import { mergeNotices } from "../notices/merge-notices.ts";
import { secretTarget } from "../plain/secret-target.ts";
import type { InboxRequests } from "../request/inbox-requests.ts";
import { ApprovalCard } from "./approval-card.tsx";
import type { NextItem } from "./card-parts.tsx";
import { countDetail, itemTitle, lateCount, rowFor } from "./inbox-row.tsx";
import { NoticesSection } from "./notices-section.tsx";
import type { RunFactsOf } from "./run-facts.ts";
import { SetupPane } from "./setup-pane.tsx";
import { useOpenItem } from "./use-open-item.ts";
import { useRequestPane } from "./use-request-pane.tsx";
import { useRunFacts } from "./use-run-facts.ts";
import { useSentRequestCard } from "./use-sent-request-card.ts";
import { WaitCard } from "./wait-card.tsx";

/** The Library's command that opens New connector; the Inbox can't import the Library, so it runs it by id. */
const newConnectorCommand = "library.new-connector";
const openBudgetCommand = "workspace.open-budget";

const loadFailed = "Couldn't load the Inbox";

/**
 * The Inbox's empty state (microcopy 10.1). The desktop list says the short line and the right pane
 * only the description, so the title shows once; a phone has no pane beside the list, so the list
 * shows both in full.
 */
const nothingWaiting = {
  title: "Nothing is waiting for you",
  description: "Approvals and questions from your runs show up here.",
};

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
  const runFacts = useRunFacts(context.services.find(RunsListService));
  return (
    <InboxView
      inbox={inbox}
      runFacts={runFacts}
      words={engineWordsOf(context)}
      announce={(line) => context.announcer.announce(line)}
      requests={context.services.find(InboxRequestsService)}
      notices={notices}
      {...(context.runCommand === undefined
        ? {}
        : {
            openNewConnector: () => context.runCommand?.(newConnectorCommand),
            openBudget: () => context.runCommand?.(openBudgetCommand),
          })}
      {...(openItem && {
        openRun: (hubId: string, runId: string) => openItem({ kind: "run", hub: hubId, id: runId }),
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
  /** Opens New connector, for a secret pasted when no account is there to take it. */
  readonly openNewConnector?: () => void;
  /** Opens Workspace settings at Budget, for **Change budget** on the monthly budget notice and the refused request. */
  readonly openBudget?: (() => void) | undefined;
  /** Opens a run's page, for **Open run** on the toast that says a request started. */
  readonly openRun?: ((hubId: string, runId: string) => void) | undefined;
  /**
   * The workflow and starter of a run: the row says the workflow, and the card says what started
   * the run and has **Open run** (with `openRun`). Without it the Inbox says neither.
   */
  readonly runFacts?: RunFactsOf | undefined;
  /** Says a line where a screen reader hears it: "New in Needs you: …" for a sent request's card that didn't open. */
  readonly announce?: ((line: string) => void) | undefined;
}

/**
 * The Inbox (flow-inbox 3.1, UX checklist 2.1, 2.3, 2.9 and 2.10): "Inbox", then Needs you, a
 * grid of what waits for you, setup items first, then newest first, with its count in the heading
 * ("Needs you, 2 waiting"), beside the open item's card. Nothing is open at first, unless Home's Needs you asked
 * for an item (`Inbox.requestOpen`). Enter or a click opens a
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
  openNewConnector,
  openBudget,
  openRun,
  runFacts,
  announce,
}: InboxViewProps) {
  const subscribe = useCallback((listener: () => void) => inbox.subscribe(listener), [inbox]);
  const state = useSyncExternalStore(subscribe, () => inbox.state);
  const { open, focus, openItem, openAt } = useOpenItem(inbox, state.items);
  const retry = () => void inbox.refresh();
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
  });

  return (
    <div className="flex h-full min-h-0 w-full">
      <div data-pane="list" className={listPaneClass(phone, itemPage)}>
        <ListHeader phone={phone} newRequest={request.newRequest} />
        {state.loaded && state.error !== undefined ? (
          <p className="px-4 pb-2 text-small text-fg-muted">{words.showingLast}</p>
        ) : null}
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
              rows={state.items.map((item) =>
                rowFor(item, now(), item.kind === "setup" ? undefined : runFacts?.(item.runId)),
              )}
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
          {failedFirst ? null : (
            <NoticesSection
              source={notices}
              openRun={openRun}
              openBudget={openBudget}
              onEmptied={() => needsYouHeading.current?.focus()}
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
              openRun={openRun}
              runFacts={runFacts}
              announce={announce}
              now={now}
              answering={state.error === undefined}
              words={words}
              close={close}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** The list's title with **New request**: beside it on a desktop, a full-width row under it on a phone. */
function ListHeader({ phone, newRequest }: { phone: boolean; newRequest: ReactNode }) {
  return (
    <>
      <header className={phone ? "sr-only" : "flex items-center justify-between px-4 py-3"}>
        <h1 className="text-title">Inbox</h1>
        {phone ? null : newRequest}
      </header>
      {phone ? newRequest : null}
    </>
  );
}

/** The list's column: 360 px beside the card, the whole page on a phone, and gone while an item is open. */
function listPaneClass(phone: boolean, itemOpen: boolean): string {
  if (!phone) return "flex w-90 shrink-0 flex-col border-e border-border";
  return `${itemOpen ? "hidden" : "flex"} w-full flex-col`;
}

/**
 * The next item for the decided card's **Next**: the one after the open one, else the first. Once
 * the open item has left the list, the one after it is the item now at `openAt`, where it was.
 */
function nextItem(
  items: readonly InboxItem[],
  open: InboxItem,
  openAt: number,
  setOpen: (item: InboxItem) => void,
): NextItem | null {
  const others = items.filter((item) => item.key !== open.key);
  const index = items.findIndex((item) => item.key === open.key);
  const after = index === -1 ? items[openAt] : items[index + 1];
  const next = after ?? others[0];
  if (next === undefined) return null;
  return {
    title: itemTitle(next),
    left: others.length,
    open: () => setOpen(next),
  };
}

function OpenCard({
  item,
  inbox,
  next,
  now,
  answering,
  words,
  close,
  items,
  focus,
  openNewConnector,
  openRun,
  runFacts,
  announce,
}: {
  readonly item: InboxItem;
  readonly inbox: Inbox;
  /** Everything waiting, to find the account a pasted secret belongs to. */
  readonly items: readonly InboxItem[];
  readonly focus: SetupFocus | undefined;
  readonly openNewConnector: (() => void) | undefined;
  readonly openRun: ((hubId: string, runId: string) => void) | undefined;
  readonly runFacts: RunFactsOf | undefined;
  readonly announce: ((line: string) => void) | undefined;
  readonly next: NextItem | null;
  readonly now: () => Date;
  readonly answering: boolean;
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
        words={words}
        close={close}
        focus={focus}
        openRun={openRun}
        announce={announce}
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
        words={words}
        {...(somewhereToGo ? { onGoToSecret: goToSecret } : {})}
        secretPlace={target.kind}
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
      words={words}
      waiting={items.some((waiting) => waiting.key === item.key)}
    />
  );
}

/**
 * The right pane with nothing open (UX checklist 2.3): the request form when the workspace offers
 * one (`form`), else a line.
 */
function NothingOpen({
  loaded,
  waiting,
  children: form,
}: {
  readonly loaded: boolean;
  readonly waiting: number;
  readonly children: ReactNode;
}) {
  if (!loaded) return null;
  if (form !== null) return form;
  if (waiting > 0) {
    return (
      <p className="m-auto p-6 text-center text-body text-fg-muted">
        Pick something on the left to see it here.
      </p>
    );
  }
  return (
    <p className="m-auto p-6 text-center text-body text-fg-muted">{nothingWaiting.description}</p>
  );
}

/**
 * Why the Inbox couldn't load: a kinded error's own reason, else that the engine isn't answering,
 * as mc 10.1 says it, since a load that fails without a kind never reached the engine.
 */
function failureReason(error: unknown, words: EngineWords): string {
  const message = errorMessageFor(error, { title: loadFailed });
  const reason = message.body.trim();
  return message.kind === "internal" || reason === "" ? words.notAnswering : reason;
}
