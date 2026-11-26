import { BackIcon, Button } from "@halonicjs/studio-kit";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { computersWords } from "../computers-words.ts";
import { forgottenWords } from "../forget-dialog.tsx";
import { HomeScreenGroup, type PhonePinning, useCanPin } from "../home-screen-group.tsx";
import type { NearbyComputers } from "../nearby-computers.ts";
import { pairWords } from "../pair-words.ts";
import { PairedComputers } from "../paired-computers.tsx";
import type { PairingView, PhonePairingFlow } from "../pairing-flow.ts";
import { PairingScreens } from "../pairing-screens.tsx";
import { shortcutWords } from "../shortcut-words.ts";
import { TypedStep } from "../typed-step.tsx";
import { ComputerScreen, type PhoneOutside } from "./computer-screen.tsx";
import type { PhoneAppRouter, PhoneAppView } from "./phone-app-router.ts";

/** What the phone app needs from the page round it. */
export interface PhoneAppProps extends PhoneOutside {
  readonly router: PhoneAppRouter;
  /** The scanner shows: the page lets the camera behind it show through. */
  readonly onCamera: (showing: boolean) => void;
  /** The shell's list of computers on this Wi-Fi, for Type a code; none outside the Android app. */
  readonly nearby?: NearbyComputers | undefined;
  /** Pinning a screen to the home screen; without it Paired computers has no Home screen group. */
  readonly pinning?: PhonePinning | undefined;
  /** Where a call the shell refused goes, for the log. */
  readonly report?: ((problem: string) => void) | undefined;
}

/**
 * The phone's tunnel screens, one at a time, as `router` picks them: Pair with a computer, a
 * paired computer's screen with its sheet, and Paired computers. The 0.1 connect screen is drawn
 * by the page, not here. A computer forgotten on its own screen is said from a region that
 * outlives that screen (C48 ST1).
 */
export function PhoneApp(props: PhoneAppProps) {
  const { router } = props;
  const view = useSyncExternalStore(router.subscribe, () => router.view);
  const [said, setSaid] = useState("");
  useEffect(() => {
    if (view.forgotten === undefined) return;
    // The same words twice in a row would change nothing, so a screen reader wouldn't say them.
    const words = forgottenWords(view.forgotten);
    setSaid((before) => (before === words ? `${words}\u00a0` : words));
  }, [view.forgotten]);
  return (
    <>
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
      <PhoneScreen {...props} view={view} />
    </>
  );
}

/**
 * Paired computers, then the Home screen group once the launcher says it pins (HAL-19149). The
 * screen's last block clears the home bar: the group when it shows, else Pair with a computer.
 */
function ComputersScreen({
  router,
  view,
  pinning,
  report,
  onBack,
}: PhoneAppProps & { readonly view: PhoneAppView; readonly onBack: (() => void) | undefined }) {
  const canPin = useCanPin(pinning, report);
  const group = canPin ? pinning : undefined;
  return (
    <TopBar title={computersWords.title} onBack={onBack} focusOnOpen>
      <PairedComputers
        computers={view.computers ?? []}
        statuses={view.statuses}
        onForget={(computer) => router.forget(computer)}
        onPair={() => router.pair()}
        onRetry={() => void router.refresh()}
        atFoot={group === undefined}
      />
      {group === undefined ? null : <HomeScreenGroup pinning={group} />}
    </TopBar>
  );
}

function PhoneScreen(props: PhoneAppProps & { readonly view: PhoneAppView }) {
  const { router, view } = props;
  const back = view.canGoBack ? () => router.back() : undefined;
  const { screen } = view;
  switch (screen.screen) {
    case "loading":
    case "address":
      return null;
    case "pair":
      return (
        <PairScreen
          {...props}
          flow={screen.flow}
          computers={view.computers}
          landing={view.landing}
          onBack={back}
        />
      );
    case "computers":
      return <ComputersScreen {...props} view={view} onBack={back} />;
    case "computer": {
      const computers = Array.isArray(view.computers) ? view.computers : [];
      const computer = computers.find((listed) => listed.id === screen.computer);
      if (computer === undefined || computer.standing === "unreadable") return null;
      return (
        // Keyed by computer, so nothing read from one computer (its Inbox) shows on the next.
        <ComputerScreen
          key={computer.id}
          router={router}
          computer={computer}
          status={view.statuses.get(computer.id)}
          sheet={screen.sheet}
          run={screen.run}
          tab={screen.tab ?? "inbox"}
          outside={props}
        />
      );
    }
  }
}

function PairScreen({
  router,
  flow,
  computers,
  landing,
  nearby,
  onBack,
  onOpenSettings,
  onCamera,
}: PhoneAppProps & {
  readonly flow: PhonePairingFlow;
  readonly computers: PhoneAppView["computers"];
  readonly landing: PhoneAppView["landing"];
  readonly onBack: (() => void) | undefined;
}) {
  const step = useSyncExternalStore(flow.subscribe, () => flow.view);
  const title = useRef<HTMLHeadingElement>(null);
  // The scanner is full-bleed, with only its Close scanner (p-m2). The bar only goes: the same
  // tree stays, since unmounting the pairing screens closes the scanner.
  return (
    <TopBar title={pairTitle(step)} onBack={onBack} bar={step.step !== "scanning"} titleRef={title}>
      <PairingScreens
        onFocusTitle={() => title.current?.focus()}
        flow={flow}
        note={landing === undefined ? undefined : shortcutWords.afterPairing[landing]}
        typed={(typed) => (
          <TypedStep
            step={typed}
            flow={flow}
            nearby={nearby}
            computers={computers}
            onEnterAddress={() => router.enterAddress()}
          />
        )}
        onOpenSettings={onOpenSettings}
        onOpenAgents={(computer) => void router.openPaired(computer)}
        onCamera={onCamera}
      />
    </TopBar>
  );
}

/** The top bar's title for a pairing step; problem screens carry their own heading. */
function pairTitle(step: PairingView): string {
  switch (step.step) {
    case "check":
      return pairWords.check.title;
    case "paired":
      return pairWords.done.title;
    case "typed":
      return pairWords.typed.title;
    default:
      return pairWords.title;
  }
}

/**
 * A screen's top bar, with Back while there's somewhere to go back to, over the screen. Its title
 * takes focus when the screen opens with `focusOnOpen`, as Paired computers does, since the
 * sheet's row that opened it is gone (C48 PC1).
 */
function TopBar({
  title,
  onBack,
  bar = true,
  focusOnOpen = false,
  titleRef,
  children,
}: {
  readonly title: string;
  readonly onBack: (() => void) | undefined;
  /** False leaves the screen alone, without the bar. */
  readonly bar?: boolean;
  readonly focusOnOpen?: boolean;
  readonly titleRef?: RefObject<HTMLHeadingElement | null>;
  readonly children: ReactNode;
}) {
  const ownTitle = useRef<HTMLHeadingElement>(null);
  const heading = titleRef ?? ownTitle;
  useEffect(() => {
    if (focusOnOpen) heading.current?.focus();
  }, [focusOnOpen, heading]);
  return (
    // Fills the page's tunnel screen, so the screens in it centre or dock at the foot.
    <div className="flex grow flex-col">
      {bar ? (
        <header className="flex min-h-14 items-center gap-2 border-b border-border px-2">
          {onBack === undefined ? null : (
            <Button
              variant="ghost"
              size="touch"
              icon={<BackIcon />}
              label="Back"
              onClick={onBack}
            />
          )}
          <h1
            ref={heading}
            tabIndex={-1}
            className="rounded-md px-2 text-heading text-fg focus-ring"
          >
            {title}
          </h1>
        </header>
      ) : (
        // Without the bar the screen keeps its title for screen readers (WCAG 1.3.1, 2.4.6).
        <h1 className="sr-only">{title}</h1>
      )}
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
