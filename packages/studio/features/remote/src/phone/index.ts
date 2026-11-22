/**
 * The phone's tunnel screens and the logic under them (task D5). They run in the Android app,
 * not in the desktop shell, so nothing under `src/phone/` imports `@halonicjs/studio-shell`
 * (`phone-boundary.test.ts`).
 */

export { pairWords } from "./pair-words.ts";
export {
  NOT_HALONIC_MS,
  type PairingFlowOptions,
  type PairingView,
  PhonePairingFlow,
  type PhoneScanner,
  type PickedComputer,
} from "./pairing-flow.ts";
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
  type PairedComputer,
  type PairingId,
  type PairingOutcome,
  type PairingStep,
  type PhoneStatus,
  type PhoneTunnel,
  phoneStatusLabelState,
  type ReachFailure,
  type TunnelPairingProblem,
  type TunnelPairingStart,
} from "./phone-tunnel.ts";
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
