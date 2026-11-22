import { useEffect, useRef, useState } from "react";
import { routeOf } from "../computers-words.ts";
import type { PhoneState } from "../phone-status.ts";
import type { PairedComputer, PhoneStatus } from "../phone-tunnel.ts";
import { StaleBanner } from "../stale-banner.tsx";
import { StandingScreen } from "../standing-screen.tsx";
import { PhoneStatusHeader } from "../status-header.tsx";
import { StatusSheet, type StatusSheetOf } from "../status-sheet.tsx";
import type { PhoneAppRouter } from "./phone-app-router.ts";

/** What the phone does outside the page: Android's settings for Halonic, and Tailscale. */
export interface PhoneOutside {
  readonly onOpenSettings: () => void;
  readonly onOpenTailscale: () => void;
}

/**
 * One paired computer (`s-m1` to `s-m9`): the header label, the stale banner while the phone
 * can't reach it, the status sheet the label opens, and Removed or Can't confirm in place of the
 * body. The agents list joins the body with the gateway client.
 */
export function ComputerScreen({
  router,
  computer,
  status,
  sheet,
  outside,
}: {
  readonly router: PhoneAppRouter;
  readonly computer: PairedComputer;
  readonly status: PhoneStatus | undefined;
  /** The status sheet is open. */
  readonly sheet: boolean;
  readonly outside: PhoneOutside;
}) {
  const state = router.stateOf(computer);
  const body = useRef<HTMLDivElement>(null);
  const sheetOf = sheet ? statusSheetOf(state, status, computer) : undefined;
  const now = useNow(sheetOf?.kind === "reconnecting");
  const tryAgain = () => router.tryAgain(computer.id);
  const onOpen = (shown: PhoneState) => {
    if (shown !== "removed" && shown !== "cantConfirm") return router.openSheet();
    // Removed and Can't confirm have no sheet: the label moves focus to the screen's heading.
    const heading = body.current?.querySelector("h2");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus();
  };
  return (
    <div className="flex min-h-full flex-col">
      <header className="flex min-h-14 items-center gap-2 border-b border-border px-4">
        {state === undefined ? (
          <h1 className="text-body-strong text-fg">{computer.name}</h1>
        ) : (
          <PhoneStatusHeader state={state} computer={computer.name} onOpen={onOpen} />
        )}
      </header>
      <div ref={body} className="flex flex-1 flex-col gap-4 p-4">
        <ComputerBody router={router} computer={computer} state={state} now={now} />
      </div>
      {sheetOf === undefined ? null : (
        <StatusSheet
          sheet={sheetOf}
          computer={computer.name}
          asOf={undefined}
          now={now}
          onTryAgain={tryAgain}
          onOpenSettings={outside.onOpenSettings}
          onOpenTailscale={outside.onOpenTailscale}
          onOpenComputers={() => router.openComputers()}
          onClose={() => router.closeSheet()}
        />
      )}
    </div>
  );
}

/** Removed or Can't confirm in place of the body, or the stale banner over it. */
function ComputerBody({
  router,
  computer,
  state,
  now,
}: {
  readonly router: PhoneAppRouter;
  readonly computer: PairedComputer;
  readonly state: PhoneState | undefined;
  readonly now: Date;
}) {
  if (state === "removed" || state === "cantConfirm") {
    return (
      <StandingScreen
        standing={state}
        computer={computer}
        onPairAgain={() => router.pair(computer.id)}
        onForget={(listed) => router.forget(listed)}
        onForgotten={() => router.leaveForgotten()}
      />
    );
  }
  if (state !== "unreachable" && state !== "phoneOffline") return null;
  return (
    <StaleBanner
      kind={state}
      computer={computer.name}
      asOf={undefined}
      now={now}
      onDetails={() => router.openSheet()}
      onTryAgain={() => router.tryAgain(computer.id)}
    />
  );
}

/** The sheet the label opens for a state; none for Removed, Can't confirm or no state. */
export function statusSheetOf(
  state: PhoneState | undefined,
  status: PhoneStatus | undefined,
  computer: PairedComputer,
): StatusSheetOf | undefined {
  const [endpoint] = computer.endpoints;
  const route = endpoint !== undefined && routeOf(endpoint) === "Tailscale" ? "tailscale" : "wifi";
  switch (state) {
    case "connected":
    case "unreachable":
      return { kind: state, route };
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
