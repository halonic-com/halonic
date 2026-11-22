/**
 * The phone's gateway client and the view it builds, without the screens (`./phone-client`).
 * For code that drives the client but draws nothing, like the shell's adapter and the interop
 * test: nothing reachable from here imports React, the kit or a `.tsx` file
 * (`phone-client-boundary.test.ts`), so it typechecks without JSX or the DOM.
 */

export type {
  ComputerTunnel,
  ComputerTunnelEvent,
  ComputerTunnelRefusal,
  ComputerTunnelSendResult,
} from "./computer-tunnel.ts";
export { GatewayClient } from "./gateway-client.ts";
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
export { ANSWER_RISKY_ON_COMPUTER } from "./view-of.ts";
