import type { PairingSession, RemoteControl, RemoteState } from "@halonicjs/ports";
import { AsyncFeed } from "@halonicjs/std";
import { RemoteRefusal } from "./remote-refusal.ts";
import type { RemoteTime } from "./remote-time.ts";

const notOfferedMessage = "This host doesn't offer remote.";

/**
 * The `RemoteControl` a host serves when it offers no remote: without a
 * tunnel provider, which the executable lacks where `tailscale` isn't installed,
 * or when it can't keep phones (requirement `agent-host.remote-not-offered`).
 * Remote is not available, so Studio shows no Remote section, and nothing
 * can turn it on, pair a phone or change a switch. It keeps no file and
 * opens no socket.
 */
export class RemoteNotOffered implements RemoteControl {
  readonly #state: RemoteState;

  constructor(time: RemoteTime) {
    this.#state = {
      available: false,
      on: false,
      tunnelProviderId: "none",
      tunnel: { state: "down", reason: "stopped", at: time.now().toISOString() },
      allowRiskyRemotely: false,
      phones: [],
      pairing: false,
    };
  }

  /** The one state, and then nothing, until the reader leaves: it never changes. */
  state(): AsyncIterable<RemoteState> {
    const feed = new AsyncFeed<RemoteState>();
    feed.push(this.#state);
    return feed;
  }

  setRemote(on: boolean): Promise<void> {
    return on ? refuse() : Promise.resolve();
  }

  startPairing(): Promise<PairingSession> {
    return refuse();
  }

  /** No phone is paired, so there is nothing to revoke. */
  revoke(_phoneId: string): Promise<void> {
    return Promise.resolve();
  }

  revokeAll(): Promise<void> {
    return Promise.resolve();
  }

  setAllowRiskyRemotely(_allow: boolean): Promise<void> {
    return refuse();
  }
}

function refuse(): Promise<never> {
  return Promise.reject(new RemoteRefusal(notOfferedMessage));
}
