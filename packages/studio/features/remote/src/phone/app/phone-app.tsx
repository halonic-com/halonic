import { BackIcon, Button } from "@halonicjs/studio-kit";
import { type ReactNode, useSyncExternalStore } from "react";
import { computersWords } from "../computers-words.ts";
import { pairWords } from "../pair-words.ts";
import { PairedComputers } from "../paired-computers.tsx";
import type { PairingView, PhonePairingFlow } from "../pairing-flow.ts";
import { PairingScreens } from "../pairing-screens.tsx";
import { ComputerScreen, type PhoneOutside } from "./computer-screen.tsx";
import type { PhoneAppRouter } from "./phone-app-router.ts";

/** What the phone app needs from the page round it. */
export interface PhoneAppProps extends PhoneOutside {
  readonly router: PhoneAppRouter;
  /** The scanner shows: the page lets the camera behind it show through. */
  readonly onCamera: (showing: boolean) => void;
}

/**
 * The phone's tunnel screens, one at a time, as `router` picks them: Pair with a computer, a
 * paired computer's screen with its sheet, and Paired computers. The 0.1 connect screen is drawn
 * by the page, not here.
 */
export function PhoneApp(props: PhoneAppProps) {
  const { router } = props;
  const view = useSyncExternalStore(router.subscribe, () => router.view);
  const back = view.canGoBack ? () => router.back() : undefined;
  const { screen } = view;
  switch (screen.screen) {
    case "loading":
    case "address":
      return null;
    case "pair":
      return <PairScreen {...props} flow={screen.flow} onBack={back} />;
    case "computers":
      return (
        <TopBar title={computersWords.title} onBack={back}>
          <PairedComputers
            computers={view.computers ?? []}
            statuses={view.statuses}
            onForget={(computer) => router.forget(computer)}
            onPair={() => router.pair()}
            onRetry={() => void router.refresh()}
          />
        </TopBar>
      );
    case "computer": {
      const computers = Array.isArray(view.computers) ? view.computers : [];
      const computer = computers.find((listed) => listed.id === screen.computer);
      if (computer === undefined || computer.standing === "unreadable") return null;
      return (
        <ComputerScreen
          router={router}
          computer={computer}
          status={view.statuses.get(computer.id)}
          sheet={screen.sheet}
          run={screen.run}
          outside={props}
        />
      );
    }
  }
}

function PairScreen({
  router,
  flow,
  onBack,
  onOpenSettings,
  onCamera,
}: PhoneAppProps & { readonly flow: PhonePairingFlow; readonly onBack: (() => void) | undefined }) {
  const step = useSyncExternalStore(flow.subscribe, () => flow.view);
  // The scanner is full-bleed, with only its Close scanner (p-m2). The bar only goes: the same
  // tree stays, since unmounting the pairing screens closes the scanner.
  return (
    <TopBar title={pairTitle(step)} onBack={onBack} bar={step.step !== "scanning"}>
      <PairingScreens
        flow={flow}
        typed={() => <TypedStep onEnterAddress={() => router.enterAddress()} />}
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
 * The typed route until its screen with the computer picker is built: only "Not listed? Enter its
 * address", which opens the 0.1 connect screen, so a computer on this Wi-Fi stays reachable.
 */
function TypedStep({ onEnterAddress }: { readonly onEnterAddress: () => void }) {
  return (
    <div className="flex flex-col gap-4 px-6 py-6">
      <Button variant="secondary" size="touch" block onClick={onEnterAddress}>
        {pairWords.typed.notListed}
      </Button>
    </div>
  );
}

/** A screen's top bar, with Back while there's somewhere to go back to, over the screen. */
function TopBar({
  title,
  onBack,
  bar = true,
  children,
}: {
  readonly title: string;
  readonly onBack: (() => void) | undefined;
  /** False leaves the screen alone, without the bar. */
  readonly bar?: boolean;
  readonly children: ReactNode;
}) {
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
          <h1 className="px-2 text-heading text-fg">{title}</h1>
        </header>
      ) : (
        // Without the bar the screen keeps its title for screen readers (WCAG 1.3.1, 2.4.6).
        <h1 className="sr-only">{title}</h1>
      )}
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
