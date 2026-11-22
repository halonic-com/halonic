import { type ReactNode, useEffect, useSyncExternalStore } from "react";
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
}: {
  readonly flow: PhonePairingFlow;
  /** The typed route, until its screen with the computer picker is in this package. */
  readonly typed: (step: TypedStep) => ReactNode;
  /** Android's settings for Halonic, to allow the camera (G8) or Nearby devices (microcopy 28). */
  readonly onOpenSettings: () => void;
  readonly onOpenAgents: (computer: PairedComputer) => void;
  /**
   * True while the scanner shows and false after: the page makes its own background see-through
   * meanwhile, so the camera behind the web view shows (Priya, HAL-12246).
   */
  readonly onCamera: (showing: boolean) => void;
}) {
  const view = useSyncExternalStore(flow.subscribe, () => flow.view);
  const onAction = (action: ProblemAction) => {
    if (action === "tryAgain") flow.tryAgain();
    else if (action === "openSettings") onOpenSettings();
    else flow.again();
  };
  // A route change or Android back unmounts this screen: the camera never stays on behind it.
  useEffect(() => () => flow.closeScanner(), [flow]);
  const scanning = view.step === "scanning";
  useEffect(() => {
    if (!scanning) return;
    onCamera(true);
    return () => onCamera(false);
  }, [scanning, onCamera]);
  switch (view.step) {
    case "start":
      return (
        <StartStep
          scanner={view.scanner}
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
