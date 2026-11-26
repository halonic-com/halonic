/**
 * The phone's tunnel screens and the logic under them (task D5). They run in the Android app,
 * not in the desktop shell, so nothing under `src/phone/` imports `@halonicjs/studio-shell`
 * (`phone-boundary.test.ts`).
 */

export { agentLine, agentRowLine, agentStateWords } from "./agent-line.ts";
export { AgentsList } from "./agents-list.tsx";
// The phone app round the screens above, for the Android app's own page (HAL-15985).
export type { ComputerTunnelOf } from "./app/held-gateway.ts";
export { mountPhoneApp, type PhoneAppMount } from "./app/mount-phone-app.tsx";
export type { HeldComputer } from "./app/phone-app-router.ts";
// The gateway client and its view, also on their own as `./phone-client`.
export {
  ANSWER_RISKY_ON_COMPUTER,
  type ComputerTunnel,
  type ComputerTunnelEvent,
  type ComputerTunnelRefusal,
  type ComputerTunnelSendResult,
  GatewayClient,
  type PhoneRemote,
  RECONNECT_TO_ANSWER,
  type RemoteApproval,
  type RemoteEvent,
  type RemoteNotSentReason,
  type RemoteRefusal,
  type RemoteSendOutcome,
  type RemoteSession,
  type RemoteView,
} from "./client.ts";
export {
  type ComputerRoute,
  computerMeta,
  computersWords,
  routeOf,
} from "./computers-words.ts";
export type { OwnerCheckAvailable, OwnerCheckReady } from "./gateway-client.ts";
export {
  MAX_NEARBY,
  type NearbyComputer,
  type NearbyComputers,
  type NearbyId,
  type NearbyStart,
} from "./nearby-computers.ts";
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
export { PromptBox, type PromptTarget } from "./prompt-box.tsx";
export { RunDetail, type RunDetailProps } from "./run-detail.tsx";
export { type RunItem, runHistory } from "./run-history.ts";
export { runWords } from "./run-words.ts";
export type { SavedDataStore } from "./saved-messaging.ts";
export { promptWords, sendOutcomeLine } from "./send-words.ts";
export { StaleBanner, type StaleBannerOf, type StaleBannerProps } from "./stale-banner.tsx";
export { type Standing, StandingScreen } from "./standing-screen.tsx";
export {
  PhoneStatusHeader,
  type PhoneStatusHeaderProps,
  STATUS_TICK_MS,
} from "./status-header.tsx";
export {
  StatusSheet,
  type StatusSheetActions,
  type StatusSheetOf,
  type StatusSheetProps,
  statusSheetTitle,
} from "./status-sheet.tsx";
export { sheetRouteWords, sheetWords, staleWords, standingWords } from "./status-words.ts";
