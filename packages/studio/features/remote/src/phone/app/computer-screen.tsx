import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { rowButtonOf } from "../agents-list.tsx";
import { routeOf } from "../computers-words.ts";
import type { ReachRoute } from "../connection-check.ts";
import { ConnectionCheckSheet } from "../connection-check-sheet.tsx";
import { CantReachPanel, ReachingLine } from "../first-reach.tsx";
import { type PhoneInboxItems, usePhoneInbox } from "../inbox/use-phone-inbox.ts";
import type { PhoneState } from "../phone-status.ts";
import type { PairedComputer, PhoneStatus } from "../phone-tunnel.ts";
import { PromptBox } from "../prompt-box.tsx";
import type { PhoneRemote, RemoteView } from "../remote-view.ts";
import { RunDetail } from "../run-detail.tsx";
import { StaleBanner } from "../stale-banner.tsx";
import { StandingScreen } from "../standing-screen.tsx";
import { PhoneStatusHeader } from "../status-header.tsx";
import { StatusSheet, type StatusSheetOf } from "../status-sheet.tsx";
import { type ComputerTab, ComputerTabs, ComputerViews } from "./computer-tabs.tsx";
import type { ComputerSheet, PhoneAppRouter } from "./phone-app-router.ts";

/**
 * What the phone does outside the page: Android's settings for Halonic, Tailscale, and a message's
 * link in the system browser.
 */
export interface PhoneOutside {
  readonly onOpenSettings: () => void;
  readonly onOpenTailscale: () => void;
  /** Opens a link `isAllowedWebLink` passed in the system browser. */
  readonly onOpenLink: (link: string) => void;
}

/**
 * One paired computer (`s-m1` to `s-m9`): the header label, the stale banner while the phone
 * can't reach it, the status sheet the label opens, and Removed or Can't confirm in place of the
 * body. Until the computer first answers, the body is the first reach's waiting line or its
 * give-up, which open Check this connection (first-run-progress 6). After that it is the picked
 * view over the tab bar at the foot (p02a): the Inbox and the Messenger, or "Update Halonic on…"
 * in the place of each while that computer speaks only version 3, or the agents from its gateway
 * client with the prompt box docked under them. The screen reads the Inbox, so the tab bar counts its cards; a tapped
 * agent's run detail shows in place of the whole screen. The computer's name is the screen's h1
 * on every state, hidden while the label shows; focus goes to it when the screen opens, and back
 * to the agent's row when its run detail closes (C48).
 */
export function ComputerScreen({
  router,
  computer,
  status,
  sheet,
  run,
  outside,
}: {
  readonly router: PhoneAppRouter;
  readonly computer: PairedComputer;
  readonly status: PhoneStatus | undefined;
  /** The sheet open over the screen, if any. */
  readonly sheet: ComputerSheet;
  /** The agent whose run detail shows, if any. */
  readonly run: string | undefined;
  readonly outside: PhoneOutside;
}) {
  const state = router.stateOf(computer);
  const remote = router.remoteOf(computer.id);
  const view = useRemoteView(remote);
  const body = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const sheetOf = sheet === "status" ? statusSheetOf(state, status, computer) : undefined;
  const now = useNow(sheetOf?.kind === "reconnecting");
  const tryAgain = () => router.tryAgain(computer.id);
  const closeRun = useCallback(() => router.closeRun(), [router]);
  const [tab, setTab] = useState<ComputerTab>("inbox");
  const viewsId = useId();
  const inbox = useComputerInbox(remote, view);
  const onOpen = (shown: PhoneState) => {
    if (shown !== "removed" && shown !== "cantConfirm") return router.openSheet();
    // Removed and Can't confirm have no sheet: the label moves focus to the screen's heading.
    const heading = body.current?.querySelector("h2");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus();
  };
  const banner =
    state === "unreachable" || state === "phoneOffline" ? (
      <StaleBanner
        kind={state}
        computer={computer.name}
        asOf={view?.asOf}
        now={now}
        onDetails={() => router.openSheet()}
        onTryAgain={tryAgain}
      />
    ) : undefined;
  const label =
    state === undefined ? null : (
      <PhoneStatusHeader state={state} computer={computer.name} onOpen={onOpen} />
    );
  const showsRun =
    run !== undefined && remote !== undefined && view !== undefined && !isStanding(state);
  useOpeningFocus(computer.id, showsRun ? run : undefined, heading, body);
  return (
    // Fills the page's tunnel screen, so the screens in it centre or dock at the foot.
    <div className="flex grow flex-col">
      {showsRun ? (
        <RunDetail
          view={view}
          sessionId={run}
          label={label}
          banner={banner}
          onBack={closeRun}
          onSend={(sessionId, text) => remote.prompt(sessionId, text)}
        />
      ) : (
        <>
          <header className="flex min-h-14 items-center gap-2 border-b border-border px-4">
            {/* Hidden, not gone, while the label shows: nothing moves (C48, CS1). */}
            <h1
              ref={heading}
              tabIndex={-1}
              className={
                label === null ? "rounded-sm text-body-strong text-fg focus-ring" : "sr-only"
              }
            >
              {computer.name}
            </h1>
            {label}
          </header>
          <div ref={body} className="flex flex-1 flex-col gap-4 p-4">
            <ComputerBody
              router={router}
              computer={computer}
              state={state}
              banner={banner}
              remote={remote}
              view={view}
              inbox={inbox}
              tab={tab}
              viewsId={viewsId}
              onOpenSettings={outside.onOpenSettings}
              onOpenLink={outside.onOpenLink}
            />
          </div>
          <ComputerFoot
            router={router}
            computer={computer}
            state={state}
            remote={remote}
            view={view}
            inbox={inbox}
            tab={tab}
            viewsId={viewsId}
            onTab={setTab}
          />
        </>
      )}
      {sheetOf === undefined ? null : (
        <StatusSheet
          sheet={sheetOf}
          computer={computer.name}
          asOf={view?.asOf}
          agents={view === undefined ? undefined : agentCounts(view)}
          now={now}
          onTryAgain={tryAgain}
          onOpenSettings={outside.onOpenSettings}
          onOpenTailscale={outside.onOpenTailscale}
          onOpenComputers={() => router.openComputers()}
          onClose={() => router.closeSheet()}
        />
      )}
      {sheet === "check" ? (
        <CheckSheet router={router} computer={computer} status={status} />
      ) : null}
    </div>
  );
}

/**
 * Where focus goes as the computer's screen opens: on another computer, or back from a run
 * detail with no row to return to, the screen's heading; back from a run detail, that agent's
 * row on the Agents list. The run detail focuses its own heading.
 */
function useOpeningFocus(
  computerId: string,
  shownRun: string | undefined,
  heading: RefObject<HTMLHeadingElement | null>,
  body: RefObject<HTMLDivElement | null>,
): void {
  const closedRun = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (shownRun !== undefined) {
      closedRun.current = shownRun;
      return;
    }
    const from = closedRun.current;
    closedRun.current = undefined;
    const row = from === undefined ? undefined : rowButtonOf(body.current, from);
    (row ?? heading.current)?.focus();
  }, [computerId, shownRun, heading, body]);
}

/** Check this connection over the computer's screen, with what the phone knows of the reach. */
function CheckSheet({
  router,
  computer,
  status,
}: {
  readonly router: PhoneAppRouter;
  readonly computer: PairedComputer;
  readonly status: PhoneStatus | undefined;
}) {
  return (
    <ConnectionCheckSheet
      facts={{
        status,
        gaveUp: router.reachOf(computer.id)?.gaveUp === true,
        route: reachRoute(computer),
        computer: computer.name,
      }}
      onCheckAgain={() => router.tryAgain(computer.id)}
      onClose={() => router.closeSheet()}
    />
  );
}

/**
 * Removed or Can't confirm in place of the body; until the first answer, the waiting line or
 * its give-up; else the picked view, under the stale banner while the phone can't reach the computer.
 */
function ComputerBody({
  router,
  computer,
  state,
  banner,
  remote,
  view,
  inbox,
  tab,
  viewsId,
  onOpenSettings,
  onOpenLink,
}: {
  readonly router: PhoneAppRouter;
  readonly computer: PairedComputer;
  readonly state: PhoneState | undefined;
  readonly banner: ReactNode;
  readonly remote: PhoneRemote | undefined;
  readonly view: RemoteView | undefined;
  readonly inbox: PhoneInboxItems;
  readonly tab: ComputerTab;
  /** The id of the element that shows the picked view, which the tab bar's tabs control. */
  readonly viewsId: string;
  readonly onOpenSettings: () => void;
  readonly onOpenLink: (link: string) => void;
}) {
  if (state === "removed" || state === "cantConfirm") {
    return (
      <StandingScreen
        standing={state}
        computer={computer}
        onPairAgain={() => router.pair(computer.id)}
        onForget={(listed) => router.forget(listed)}
        // `forget` has already left this computer's screen.
        onForgotten={() => undefined}
      />
    );
  }
  const reach = router.reachOf(computer.id);
  if (reach !== undefined && shownFirstReach(router, computer, state)) {
    return (
      <div className="grid flex-1 place-items-center">
        {state === "unreachable" ? (
          <CantReachPanel
            computer={computer.name}
            route={reachRoute(computer)}
            onTryAgain={() => router.tryAgain(computer.id)}
            onCheck={() => router.openCheck()}
          />
        ) : (
          <ReachingLine
            computer={computer.name}
            since={reach.since}
            heldAt={reach.heldAt}
            onSomethingWrong={() => router.openCheck()}
          />
        )}
      </div>
    );
  }
  if (remote === undefined || view === undefined) return banner;
  return (
    <>
      {banner}
      <div id={viewsId} className="flex flex-1 flex-col gap-4">
        <ComputerViews
          router={router}
          computer={computer.name}
          remote={remote}
          view={view}
          inbox={inbox}
          tab={tab}
          onOpenSettings={onOpenSettings}
          onOpenLink={onOpenLink}
        />
      </div>
    </>
  );
}

/**
 * The foot of the screen once the agents show: the prompt box docked under the Agents list, then
 * the tab bar (p02a).
 */
function ComputerFoot({
  router,
  computer,
  state,
  remote,
  view,
  inbox,
  tab,
  viewsId,
  onTab,
}: {
  readonly router: PhoneAppRouter;
  readonly computer: PairedComputer;
  readonly state: PhoneState | undefined;
  readonly remote: PhoneRemote | undefined;
  readonly view: RemoteView | undefined;
  readonly inbox: PhoneInboxItems;
  readonly tab: ComputerTab;
  readonly viewsId: string;
  readonly onTab: (tab: ComputerTab) => void;
}) {
  if (remote === undefined || view === undefined) return null;
  if (shownFirstReach(router, computer, state)) return null;
  return (
    <>
      {tab === "agents" ? (
        <PromptBox
          view={view}
          agent={undefined}
          onSend={(sessionId, text) => remote.prompt(sessionId, text)}
        />
      ) : null}
      <ComputerTabs
        computer={computer.name}
        inbox={inbox}
        selected={tab}
        controls={viewsId}
        onSelect={onTab}
      />
    </>
  );
}

/** Removed and Can't confirm: the computer's standing shows in place of everything else. */
function isStanding(state: PhoneState | undefined): boolean {
  return state === "removed" || state === "cantConfirm";
}

/** Whether the body is the first reach's waiting line or its give-up, not the agents. */
function shownFirstReach(
  router: PhoneAppRouter,
  computer: PairedComputer,
  state: PhoneState | undefined,
): boolean {
  if (isStanding(state)) return true;
  return router.reachOf(computer.id) !== undefined && state !== "phoneOffline";
}

/** Running and waiting agents, for the trouble sheets' Your agents card. */
function agentCounts(view: RemoteView): { readonly running: number; readonly waiting: number } {
  const count = (state: string) => view.sessions.filter((each) => each.state === state).length;
  return { running: count("running"), waiting: count("waiting") };
}

/**
 * The computer's open Inbox cards, read while its view is live, so the tab bar counts them on
 * every tab; none while it speaks only version 3, which has no Inbox.
 */
function useComputerInbox(
  remote: PhoneRemote | undefined,
  view: RemoteView | undefined,
): PhoneInboxItems {
  const messaging = view?.olderComputer === true ? undefined : remote?.messaging;
  return usePhoneInbox(messaging, view?.canAnswer === true);
}

const noRemote = (): (() => void) => () => undefined;

/** The newest view of `remote`, drawn again on each new one; `undefined` without a remote. */
function useRemoteView(remote: PhoneRemote | undefined): RemoteView | undefined {
  const subscribe = useCallback(
    (onChange: () => void) => (remote === undefined ? noRemote() : remote.subscribe(onChange)),
    [remote],
  );
  return useSyncExternalStore(subscribe, () => remote?.view());
}

/** The sheet the label opens for a state; none for Removed, Can't confirm or no state. */
export function statusSheetOf(
  state: PhoneState | undefined,
  status: PhoneStatus | undefined,
  computer: PairedComputer,
): StatusSheetOf | undefined {
  switch (state) {
    case "connected":
    case "unreachable":
      return { kind: state, route: reachRoute(computer) };
    case "reconnecting": {
      const nextTryAt = status?.state === "reconnecting" ? status.nextTryAt : undefined;
      return { kind: "reconnecting", nextTryAt: nextTryAt ? new Date(nextTryAt) : undefined };
    }
    case "phoneOffline":
      return { kind: "phoneOffline" };
    default:
      return undefined;
  }
}

/** How the phone reaches the computer: Tailscale, or this Wi-Fi, from its first endpoint. */
function reachRoute(computer: PairedComputer): ReachRoute {
  const [endpoint] = computer.endpoints;
  return endpoint !== undefined && routeOf(endpoint) === "Tailscale" ? "tailscale" : "wifi";
}

/** The phone's clock, read again each second while `ticking`: Reconnecting's countdown. */
function useNow(ticking: boolean): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!ticking) return;
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);
  return now;
}
