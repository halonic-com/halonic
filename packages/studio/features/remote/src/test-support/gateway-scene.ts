import {
  type GatewayEventBody,
  type GatewaySession,
  gatewayMaxMessageBytes,
  gatewayPhoneProtocolVersions,
  gatewayProtocolVersion,
} from "@halonicjs/ports";
import { GatewayClient, type OwnerCheckAvailable } from "../phone/gateway-client.ts";
import { FakeComputerTunnel } from "./fake-computer-tunnel.ts";

/** The computer the scene's client is paired with. */
export const SCENE_COMPUTER = "Work laptop";

/** A fake shell with helpers to play the host behind it, for whatever client listens to it. */
export class GatewayHost {
  readonly tunnel = new FakeComputerTunnel();
  generation = 0;

  /** A new session opens and the host welcomes the phone's `hello`. */
  connect(): void {
    this.generation += 1;
    this.tunnel.status("connected");
    this.tunnel.open(this.generation);
    this.host({
      type: "welcome",
      replyTo: this.tunnel.lastOf("hello").id,
      version: gatewayProtocolVersion,
      maxMessageBytes: gatewayMaxMessageBytes,
    });
  }

  /**
   * A computer of message `version`: it closes on each `hello` of another
   * version, one session each, until the phone steps down to `version`, and
   * welcomes that one.
   */
  connectAt(version: number): void {
    // One session per version the phone can step down through, and no more.
    for (let tries = 0; ; tries += 1) {
      if (tries === gatewayPhoneProtocolVersions.length) {
        throw new Error(`The phone never said hello with version ${version}.`);
      }
      this.generation += 1;
      this.tunnel.status("connected");
      this.tunnel.open(this.generation);
      const hello = this.tunnel.lastOf("hello");
      if (hello.version === version) break;
      this.host({ type: "error", code: "unsupported-version" });
      this.drop();
    }
    this.host({
      type: "welcome",
      replyTo: this.tunnel.lastOf("hello").id,
      version,
      maxMessageBytes: gatewayMaxMessageBytes,
    });
  }

  /** The host answers the newest `list-sessions` with `sessions`, and whether risky answers are on. */
  list(sessions: readonly GatewaySession[], answersRisky = false): void {
    const replyTo = this.tunnel.lastOf("list-sessions").id;
    this.host({ type: "sessions", replyTo, sessions, answersRisky });
  }

  /** The host pushes the full list unasked, as after its risky switch changed. */
  push(sessions: readonly GatewaySession[], answersRisky: boolean): void {
    this.host({ type: "sessions", sessions, answersRisky });
  }

  /** {@link connect}, then {@link list}: the view is live. */
  connectAndList(sessions: readonly GatewaySession[]): void {
    this.connect();
    this.list(sessions);
  }

  /** The host sends event `seq` of `sessionId`. */
  event(sessionId: string, seq: number, body: GatewayEventBody): void {
    this.host({ type: "event", sessionId, seq, at: "2026-11-21T14:03:00.000Z", body });
  }

  /** The host answers the message `id` with `ok`. */
  ok(id: string): void {
    this.host({ type: "ok", replyTo: id });
  }

  /** The host sends `message` in the open session. */
  host(message: Parameters<FakeComputerTunnel["host"]>[1]): void {
    this.tunnel.host(this.generation, message);
  }

  /** The connection drops. */
  drop(): void {
    this.tunnel.status("reconnecting");
  }
}

/** A gateway client over a fake shell, with helpers to play the host. */
export class GatewayScene extends GatewayHost {
  readonly client: GatewayClient;

  /** `ownerCheck` stands for the shell's `owner_check_available`; without one it never can ask. */
  constructor(ownerCheck?: OwnerCheckAvailable) {
    super();
    this.client = new GatewayClient(this.tunnel, SCENE_COMPUTER, ownerCheck);
  }
}
