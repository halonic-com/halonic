import type { GatewayClientMessage, GatewayHostMessage } from "@halonicjs/ports";
import type {
  ComputerTunnel,
  ComputerTunnelEvent,
  ComputerTunnelRefusal,
  ComputerTunnelSendResult,
} from "../phone/computer-tunnel.ts";
import type { PhoneState } from "../phone/phone-status.ts";

/** One message the page sent, as the shell would have sealed it. */
export interface SentMessage {
  readonly generation: number;
  readonly message: GatewayClientMessage;
}

/**
 * A shell that records what the page sends and lets a test play the host.
 * Like the real shell it never queues or resends, refuses `not-open` for a
 * generation that isn't the open session's, sends nothing while
 * {@link refuseWith} is set, and replays the current status and open session
 * to a new subscriber.
 */
export class FakeComputerTunnel implements ComputerTunnel {
  readonly sent: SentMessage[] = [];
  /** The generations of the sessions the page ended, oldest first. */
  readonly ended: number[] = [];
  /** The shell's refusal for every send while set. */
  refuseWith: ComputerTunnelRefusal | undefined;
  private state: PhoneState | undefined;
  private openGeneration: number | undefined;
  private readonly listeners = new Set<(event: ComputerTunnelEvent) => void>();

  send(generation: number, text: string): Promise<ComputerTunnelSendResult> {
    if (this.refuseWith !== undefined) {
      return Promise.resolve({ sent: false, reason: this.refuseWith });
    }
    if (generation !== this.openGeneration) {
      return Promise.resolve({ sent: false, reason: "not-open" });
    }
    this.sent.push({ generation, message: JSON.parse(text) as GatewayClientMessage });
    return Promise.resolve({ sent: true });
  }

  endSession(generation: number): Promise<void> {
    this.ended.push(generation);
    if (generation === this.openGeneration) this.openGeneration = undefined;
    return Promise.resolve();
  }

  subscribe(listener: (event: ComputerTunnelEvent) => void): () => void {
    if (this.state !== undefined) listener({ kind: "status", state: this.state });
    if (this.openGeneration !== undefined) {
      listener({ kind: "session-opened", generation: this.openGeneration });
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The connection's state changed. */
  status(state: PhoneState): void {
    this.state = state;
    if (state !== "connected") this.openGeneration = undefined;
    this.emit({ kind: "status", state });
  }

  /** A session's handshake finished. */
  open(generation: number): void {
    this.openGeneration = generation;
    this.emit({ kind: "session-opened", generation });
  }

  /** The host sent `message`, or raw `text`, in the session of `generation`. */
  host(generation: number, message: GatewayHostMessage | string): void {
    const text = typeof message === "string" ? message : JSON.stringify(message);
    this.emit({ kind: "message", generation, text });
  }

  /** The messages of `type` the page sent, oldest first. */
  sentOf<Type extends GatewayClientMessage["type"]>(
    type: Type,
  ): Extract<GatewayClientMessage, { type: Type }>[] {
    return this.sent
      .map((entry) => entry.message)
      .filter((message): message is Extract<GatewayClientMessage, { type: Type }> => {
        return message.type === type;
      });
  }

  /** The newest message of `type` the page sent; throws when there is none. */
  lastOf<Type extends GatewayClientMessage["type"]>(
    type: Type,
  ): Extract<GatewayClientMessage, { type: Type }> {
    const last = this.sentOf(type).at(-1);
    if (last === undefined) throw new Error(`the page sent no ${type}`);
    return last;
  }

  private emit(event: ComputerTunnelEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
