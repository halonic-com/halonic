import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import type { PairingView, PhonePairingFlow } from "./pairing-flow.ts";
import {
  CheckStep,
  ConnectingStep,
  NoCameraStep,
  PairedStep,
  ScannerStep,
  StartStep,
} from "./pairing-steps.tsx";
import type { PairedComputer } from "./phone-tunnel.ts";
import { PhoneProblemScreen, type ProblemAction, ProblemScreen } from "./problem-screen.tsx";

/** The typed route's step (`p-m5`, `p-m9`), drawn by its own screen with the computer picker. */
export type TypedStep = Extract<PairingView, { step: "typed" }>;

/**
 * The phone's pairing screens, one per step of `flow`. The page round it draws the header and
 * Android back; leaving this screen while the scanner is open closes the camera.
 */
export function PairingScreens({
  flow,
  typed,
  onOpenSettings,
  onOpenAgents,
  onCamera,
  onFocusTitle,
}: {
  readonly flow: PhonePairingFlow;
  /** The typed route's screen with the computer picker (`TypedStep`), which needs the app's lists. */
  readonly typed: (step: TypedStep) => ReactNode;
  /** Android's settings for Halonic, to allow the camera (G8) or Nearby devices (microcopy 28). */
  readonly onOpenSettings: () => void;
  readonly onOpenAgents: (computer: PairedComputer) => void;
  /**
   * True while the scanner shows and false after: the page makes its own background see-through
   * meanwhile, so the camera behind the web view shows (Priya, HAL-12246).
   */
  readonly onCamera: (showing: boolean) => void;
  /** Moves focus to the screen's title, for a step whose pressed button has gone (C48 PF1). */
  readonly onFocusTitle?: () => void;
}) {
  const view = useSyncExternalStore(flow.subscribe, () => flow.view);
  const scanButton = useRef<HTMLButtonElement>(null);
  useStepFocus(view.step, scanButton, onFocusTitle);
  const onAction = (action: ProblemAction) => {
    if (action === "tryAgain") flow.tryAgain();
    else if (action === "openSettings") onOpenSettings();
    else flow.again();
  };
  // A route change or Android back unmounts this screen: the camera never stays on behind it.
  // Only while scanning, so StrictMode's extra unmount right after mount calls nothing.
  useEffect(
    () => () => {
      if (flow.view.step === "scanning") flow.closeScanner();
    },
    [flow],
  );
  const scanning = view.step === "scanning";
  // The newest callback, so a page that passes an inline function doesn't flip its background
  // off and on again at every render while scanning.
  const cameraCallback = useRef(onCamera);
  useLayoutEffect(() => {
    cameraCallback.current = onCamera;
  });
  useEffect(() => {
    if (!scanning) return;
    cameraCallback.current(true);
    return () => cameraCallback.current(false);
  }, [scanning]);
  switch (view.step) {
    case "start":
      return (
        <StartStep
          scanner={view.scanner}
          scanRef={scanButton}
          onScan={() => flow.scan()}
          onTypeInstead={() => flow.typeInstead()}
        />
      );
    case "scanning":
      return <ScannerStep notHalonic={view.notHalonic} onClose={() => flow.closeScanner()} />;
    case "noCamera":
      return (
        <NoCameraStep onOpenSettings={onOpenSettings} onTypeInstead={() => flow.typeInstead()} />
      );
    case "typed":
      return typed(view);
    case "connecting":
      return <ConnectingStep />;
    case "check":
      return (
        <CheckStep
          checkCode={view.checkCode}
          computerName={view.computerName}
          onCancel={() => flow.cancel()}
        />
      );
    case "paired":
      return (
        <PairedStep computer={view.computer} onOpenAgents={() => onOpenAgents(view.computer)} />
      );
    case "problem": {
      const { problem } = view;
      // The typed route's wrong code goes back to the typed screen with its error, never here.
      if (problem.screen === "typedWrong")
        return typed({ step: "typed", triesLeft: problem.triesLeft });
      return (
        <ProblemScreen
          problem={problem}
          computer={view.computerName}
          // Only the route picks the words here; the problem carries its own Wi-Fi.
          from={view.route === "typed" ? { route: "typed", wifi: false } : { route: "qr" }}
          onAction={onAction}
          onCancel={() => flow.cancel()}
        />
      );
    }
    case "phoneProblem":
      return (
        <PhoneProblemScreen
          problem={view.problem}
          computer={view.computerName}
          onAction={onAction}
          onCancel={() => flow.cancel()}
        />
      );
  }
}

/** The steps without focus of their own: their title takes it when they show. */
const titledSteps: ReadonlySet<PairingView["step"]> = new Set(["start", "typed", "connecting"]);

/**
 * Where focus goes when a step shows whose pressed button has gone: Scan code after the scanner
 * closes, else the title. The scanner, Camera off, Check the code, Paired and the problem
 * screens set their own (C48 PF1).
 */
function useStepFocus(
  step: PairingView["step"],
  scanButton: RefObject<HTMLButtonElement | null>,
  onFocusTitle: (() => void) | undefined,
): void {
  const shown = useRef<PairingView["step"]>(undefined);
  const focusTitle = useRef(onFocusTitle);
  useLayoutEffect(() => {
    focusTitle.current = onFocusTitle;
  });
  useEffect(() => {
    const from = shown.current;
    shown.current = step;
    // StrictMode runs this twice on mount; the step hasn't changed the second time.
    if (from === step || !titledSteps.has(step)) return;
    if (from === "scanning" && scanButton.current !== null) scanButton.current.focus();
    else focusTitle.current?.();
  }, [step, scanButton]);
}
