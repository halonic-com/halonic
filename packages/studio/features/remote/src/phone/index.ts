/**
 * The phone's tunnel screens and the logic under them (task D5). They run in the Android app,
 * not in the desktop shell, so nothing under `src/phone/` imports `@halonicjs/studio-shell`
 * (`phone-boundary.test.ts`).
 */

export type {
  ComputerTunnel,
  ComputerTunnelEvent,
  ComputerTunnelRefusal,
  ComputerTunnelSendResult,
} from "./computer-tunnel.ts";
export {
  type ComputerRoute,
  computerMeta,
  computersWords,
  routeOf,
} from "./computers-words.ts";
export { pairWords } from "./pair-words.ts";
export { computerRowState, PairedComputers } from "./paired-computers.tsx";
export {
  NOT_HALONIC_MS,
  type PairingFlowOptions,
  type PairingView,
  PhonePairingFlow,
  type PhoneScanner,
  type PickedComputer,
} from "./pairing-flow.ts";
export { PairingScreens, type TypedStep } from "./pairing-screens.tsx";
export {
  agentsAsOfText,
  asOfText,
  dayOf,
  secondsText,
  spelled,
  spoken,
  timeOf,
  triesLeftText,
} from "./phone-forms.ts";
export {
  type FoundComputer,
  type PairingFrom,
  type PairingProblemScreen,
  type PairingStop,
  type PhoneRoute,
  problemScreen,
} from "./phone-pairing.ts";
export {
  type PhoneState,
  type PhoneStatusChange,
  type PhoneStatusLabel,
  type PhoneStatusTone,
  PhoneStatusTracker,
  phoneStatusLabel,
  RECONNECTING_QUIET_MS,
} from "./phone-status.ts";
export {
  type ComputerId,
  type ConnectOutcome,
  type ForgetOutcome,
  type KeysUnavailable,
  type ListedComputer,
  type PairedComputer,
  type PairingId,
  type PairingOutcome,
  type PairingStep,
  type PhoneKeyProblem,
  type PhoneStatus,
  type PhoneTunnel,
  phoneStatusLabelState,
  type ReachFailure,
  type TunnelPairingProblem,
  type TunnelPairingStart,
  type UnreadableComputer,
} from "./phone-tunnel.ts";
export {
  PhoneProblemScreen,
  type ProblemAction,
  ProblemScreen,
  type ProblemScreenOf,
  type ProblemWords,
  phoneProblemWords,
  problemWords,
} from "./problem-screen.tsx";
export {
  type PhoneRemote,
  RECONNECT_TO_ANSWER,
  type RemoteApproval,
  type RemoteEvent,
  type RemoteNotSentReason,
  type RemoteRefusal,
  type RemoteSendOutcome,
  type RemoteSession,
  type RemoteView,
} from "./remote-view.ts";
export {
  StatusSheet,
  type StatusSheetActions,
  type StatusSheetOf,
  type StatusSheetProps,
  statusSheetTitle,
} from "./status-sheet.tsx";
export { sheetRouteWords, sheetWords } from "./status-words.ts";
export { ANSWER_RISKY_ON_COMPUTER } from "./view-of.ts";
