import {
  type GatewayEventBody,
  type GatewaySession,
  gatewayMaxMessageBytes,
  gatewayProtocolVersion,
} from "@halonicjs/ports";
import { GatewayClient } from "../phone/gateway-client.ts";
import { FakeComputerTunnel } from "./fake-computer-tunnel.ts";

/** The computer the scene's client is paired with. */
export const SCENE_COMPUTER = "Work laptop";

/** A session as the host lists it, with `overrides` on top. */
export function listedSession(overrides: Partial<GatewaySession> = {}): GatewaySession {
  return {
    id: "session-1",
    title: "Weekly report",
    state: "running",
    lastSeq: 0,
    updatedAt: "2026-11-21T14:02:00.000Z",
    ...overrides,
  };
}

/** A gateway client over a fake shell, with helpers to play the host. */
export class GatewayScene {
  readonly tunnel = new FakeComputerTunnel();
  readonly client = new GatewayClient(this.tunnel, SCENE_COMPUTER);
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

  /** The host answers the newest `list-sessions` with `sessions`. */
  list(sessions: readonly GatewaySession[]): void {
    this.host({ type: "sessions", replyTo: this.tunnel.lastOf("list-sessions").id, sessions });
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
