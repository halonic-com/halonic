import type { ComputerTunnel } from "../computer-tunnel.ts";
import { GatewayClient, type OwnerCheckAvailable } from "../gateway-client.ts";
import type { ComputerId, PairedComputer } from "../phone-tunnel.ts";
import type { HeldComputer } from "./phone-app-router.ts";

/** The shell's tunnel to one paired computer, for its gateway client. */
export type ComputerTunnelOf = (computer: ComputerId) => ComputerTunnel;

/**
 * Holds a gateway client for each computer whose screen opens (tunnel D7d, HAL-15180): the real
 * {@link GatewayClient} over the shell's tunnel to that computer, in place of the fake the screens
 * were built on. The client asks for the session list only while the app is in front, so it
 * follows the page's visibility until it is dropped.
 */
export function holdGateway(
  tunnelOf: ComputerTunnelOf,
  document: Document,
  ownerCheck?: OwnerCheckAvailable,
): (computer: PairedComputer) => HeldComputer {
  return (computer) => {
    const client = new GatewayClient(tunnelOf(computer.id), computer.name, ownerCheck);
    const follow = () => client.setInFront(document.visibilityState === "visible");
    follow();
    document.addEventListener("visibilitychange", follow);
    return {
      view: () => client.view(),
      subscribe: (onChange) => client.subscribe(onChange),
      answer: (sessionId, approvalId, decision) => client.answer(sessionId, approvalId, decision),
      prompt: (sessionId, text) => client.prompt(sessionId, text),
      messaging: client.messaging,
      dispose: () => {
        document.removeEventListener("visibilitychange", follow);
        client.dispose();
      },
    };
  };
}
