import {
  type GatewayClientMessage,
  type GatewayHostMessage,
  gatewayMaxBufferedBytes,
  gatewayMaxMessageBytes,
  gatewayMaxWatches,
  gatewayProtocolVersion,
  type gatewayRefusalCodes,
} from "@halonicjs/ports";
import { fitEvent } from "./fit-event.ts";
import { type GatewayFrame, parseGatewayClientMessage } from "./message-parser.ts";
import type { GatewayPolicy, GatewaySessionEvent, GatewaySessionSource } from "./session-source.ts";

/** What a connection needs from the transport that carries it. */
export interface GatewayTransport {
  /** Sends one text frame. */
  send(json: string): void;
  /** How many bytes are queued to send and not yet written out. */
  bufferedBytes(): number;
  /** Closes the connection. */
  close(): void;
}

export interface GatewayConnectionDeps {
  source: GatewaySessionSource;
  policy: GatewayPolicy;
  transport: GatewayTransport;
}

/** How many frames may wait to be handled (the one being handled included) before the phone is cut off. */
const maxPendingFrames = 32;

type ClosingCode = "malformed" | "too-large" | "unsupported-version";
type RefusalCode = (typeof gatewayRefusalCodes)[number];

/** One watched session. */
interface Watch {
  stop(): void;
}

/**
 * One phone's connection to the gateway: the rules of requirement
 * `ports.remote-gateway-protocol`, for one connection. It reads each frame,
 * answers, streams the events of the sessions the phone watches, and closes
 * the connection when the rules say so. The transport only carries frames.
 *
 * Frames are handled one at a time in the order they arrived, so an answer to
 * an approval can't overtake the message before it.
 */
export class GatewayConnection {
  private readonly deps: GatewayConnectionDeps;
  private readonly watches = new Map<string, Watch>();
  private greeted = false;
  private closed = false;
  private pendingFrames = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(deps: GatewayConnectionDeps) {
    this.deps = deps;
  }

  /**
   * Handles one frame the phone sent. Frames that arrive after the connection closed are dropped.
   * A phone that sends faster than the host answers is closed once too many frames wait.
   */
  receive(frame: GatewayFrame): void {
    if (this.closed) return;
    if (this.pendingFrames >= maxPendingFrames) {
      this.close();
      return;
    }
    this.pendingFrames++;
    this.chain = this.chain
      .then(() => this.handleFrame(frame))
      .catch(() => this.close())
      .finally(() => {
        this.pendingFrames--;
      });
  }

  /** The transport's connection ended: stops every watch. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const watch of this.watches.values()) watch.stop();
    this.watches.clear();
    this.deps.transport.close();
  }

  private async handleFrame(frame: GatewayFrame): Promise<void> {
    if (this.closed) return;
    const parsed = parseGatewayClientMessage(frame);
    if (!parsed.ok) {
      this.closeWith(parsed.code);
      return;
    }
    const message = parsed.message;
    if (message.type === "hello") return this.hello(message);
    if (!this.greeted) {
      this.closeWith("malformed");
      return;
    }
    switch (message.type) {
      case "list-sessions":
        return this.reply({
          type: "sessions",
          replyTo: message.id,
          sessions: this.deps.source.list(),
        });
      case "watch":
        return this.watch(message);
      case "unwatch":
        return this.unwatch(message);
      case "answer-approval":
        return this.answer(message);
      case "prompt":
        return this.prompt(message);
    }
  }

  private hello(message: Extract<GatewayClientMessage, { type: "hello" }>): void {
    if (this.greeted) {
      this.closeWith("malformed");
      return;
    }
    if (message.version !== gatewayProtocolVersion) {
      this.closeWith("unsupported-version");
      return;
    }
    this.greeted = true;
    this.reply({
      type: "welcome",
      replyTo: message.id,
      version: gatewayProtocolVersion,
      maxMessageBytes: gatewayMaxMessageBytes,
    });
  }

  private watch(message: Extract<GatewayClientMessage, { type: "watch" }>): void {
    const { sessionId, afterSeq } = message;
    const session = this.deps.source.list().find((candidate) => candidate.id === sessionId);
    if (session === undefined) {
      this.refuse(message.id, "unknown-session");
      return;
    }
    if (afterSeq > session.lastSeq) {
      this.closeWith("malformed");
      return;
    }
    const replaced = this.watches.has(sessionId);
    if (!replaced && this.watches.size >= gatewayMaxWatches) {
      this.refuse(message.id, "too-many-watches");
      return;
    }
    const watch: Watch = { stop: () => undefined };
    // The source calls `onEvent` only after it has returned, so `ok` goes out before the first event.
    const result = this.deps.source.watch(sessionId, afterSeq, (event) =>
      this.deliver(sessionId, watch, event),
    );
    if (result.kind !== "watching") {
      this.refuse(message.id, result.kind);
      return;
    }
    watch.stop = result.stop;
    this.watches.get(sessionId)?.stop();
    this.watches.set(sessionId, watch);
    this.reply({ type: "ok", replyTo: message.id });
  }

  private unwatch(message: Extract<GatewayClientMessage, { type: "unwatch" }>): void {
    const watch = this.watches.get(message.sessionId);
    if (watch === undefined) {
      this.refuse(message.id, "unknown-session");
      return;
    }
    watch.stop();
    this.watches.delete(message.sessionId);
    this.reply({ type: "ok", replyTo: message.id });
  }

  private async answer(
    message: Extract<GatewayClientMessage, { type: "answer-approval" }>,
  ): Promise<void> {
    const { source, policy } = this.deps;
    const risk = source.approvalRisk(message.sessionId, message.approvalId);
    if (risk === undefined) {
      this.refuse(message.id, "unknown-approval");
      return;
    }
    if (risk === "risky" && !policy.allowRiskyRemotely()) {
      return this.refuse(message.id, "not-allowed-remotely");
    }
    try {
      await source.answerApproval(message.sessionId, message.approvalId, message.decision);
    } catch {
      // Settled between the check and the answer, here or on the desktop.
      return this.refuse(message.id, "unknown-approval");
    }
    this.reply({ type: "ok", replyTo: message.id });
  }

  private async prompt(message: Extract<GatewayClientMessage, { type: "prompt" }>): Promise<void> {
    const known = this.deps.source.list().some((session) => session.id === message.sessionId);
    if (!known) {
      this.refuse(message.id, "unknown-session");
      return;
    }
    try {
      await this.deps.source.sendPrompt(message.sessionId, message.text);
    } catch {
      // A session that can't take a message now is, for the phone, one it can't use.
      return this.refuse(message.id, "unknown-session");
    }
    this.reply({ type: "ok", replyTo: message.id });
  }

  /**
   * Passes an event on, unless its watch was replaced, ended or the connection closed.
   * It runs in the source's callback, outside `chain`, so a failure here closes the
   * connection instead of reaching the host's session code.
   */
  private deliver(sessionId: string, watch: Watch, event: GatewaySessionEvent): void {
    if (this.watches.get(sessionId) !== watch) return;
    try {
      this.sendEvent(sessionId, event);
    } catch {
      this.close();
    }
  }

  private sendEvent(sessionId: string, event: GatewaySessionEvent): void {
    const json = fitEvent({ type: "event", sessionId, ...event });
    // An event that can't be made to fit would leave a gap the phone must not see.
    if (json === undefined) {
      this.close();
      return;
    }
    this.write(json);
  }

  private refuse(replyTo: string, code: RefusalCode): void {
    this.reply({ type: "error", replyTo, code });
  }

  private reply(message: GatewayHostMessage): void {
    this.write(JSON.stringify(message));
  }

  private closeWith(code: ClosingCode): void {
    this.reply({ type: "error", code });
    this.close();
  }

  /** Sends one frame, and closes a phone that reads more slowly than its sessions produce events. */
  private write(json: string): void {
    if (this.closed) return;
    this.deps.transport.send(json);
    if (this.deps.transport.bufferedBytes() > gatewayMaxBufferedBytes) this.close();
  }
}
