import type { RemoteState } from "@halonicjs/ports";

/**
 * The dot before the item's words: none while remote is off, a ring while no phone is connected,
 * filled in the success colour while one is, in the attention colour while the tunnel starts or
 * has trouble. The words always say the state; the dot is decoration.
 */
export type StatusDot = "none" | "ring" | "connected" | "attention";

/** What the status bar item shows. */
export interface StatusWords {
  readonly text: string;
  readonly dot: StatusDot;
}

/**
 * The status bar item's six states (design "Tunnel phase B screens", decision 2): "Remote off",
 * "Remote on · no phone", "Pixel 8 connected", "2 phones connected", "Starting remote…" and
 * "Remote needs attention". `undefined` while the host doesn't offer remote: then there is no item.
 */
export function statusWords(state: RemoteState): StatusWords | undefined {
  if (!state.available) return undefined;
  if (!state.on) return { text: "Remote off", dot: "none" };
  if (state.tunnel.state === "starting") return { text: "Starting remote…", dot: "attention" };
  if (state.tunnel.state !== "ready") return { text: "Remote needs attention", dot: "attention" };
  const connected = state.phones.filter((phone) => phone.connected);
  const [only] = connected;
  if (only === undefined) return { text: "Remote on · no phone", dot: "ring" };
  if (connected.length === 1) return { text: `${only.name} connected`, dot: "connected" };
  return { text: `${connected.length} phones connected`, dot: "connected" };
}
