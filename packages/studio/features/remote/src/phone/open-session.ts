/**
 * One open session of the phone tunnel, from `session-opened` until it drops
 * (tunnel D7, design on HAL-15159, section 1): what the gateway client sent
 * in it and waits for the host to answer. A message of one session is never
 * sent in another, and nothing is queued or sent again.
 */

import type { GatewayClientMessage, GatewayHostMessage } from "@halonicjs/ports";
import type { ComputerTunnel, ComputerTunnelRefusal } from "./computer-tunnel.ts";
import type { RemoteNotSentReason, RemoteRefusal, RemoteSendOutcome } from "./remote-view.ts";

/** An answer or a prompt, settled by the host, the shell or a drop. */
export interface PendingSend {
  readonly kind: "answer" | "prompt";
  /** The approval an answer is for. */
  readonly approvalId?: string;
  readonly settle: (outcome: RemoteSendOutcome) => void;
}

/** A host message that answers a request by its `replyTo`. */
export type MessagingAnswer = Extract<
  GatewayHostMessage,
  { type: "msg-data" | "msg-result" | "team-data" | "ok" }
>;

/**
 * What settles a version 4 Inbox, Messenger or team status request: the host's answer, its
 * refusal, the shell's refusal, or a drop before any of them.
 */
export type MessagingSettled =
  | { readonly kind: "answered" }
  | { readonly kind: "refused"; readonly code: RemoteRefusal }
  | { readonly kind: "not-sent"; readonly reason: RemoteNotSentReason }
  | { readonly kind: "cut-off" };

/** A version 4 Inbox or Messenger request, settled once. */
export interface PendingMessaging {
  readonly kind: "messaging";
  /** Whether `message`, which names this request in `replyTo`, answers it, and takes what it holds. */
  readonly answers: (message: MessagingAnswer) => boolean;
  readonly settle: (settled: MessagingSettled) => void;
}

/** A message the phone sent and waits for the host to answer. */
export type Pending =
  | { readonly kind: "hello" | "list" }
  | { readonly kind: "watch"; readonly sessionId: string }
  | { readonly kind: "unwatch"; readonly sessionId: string }
  | PendingSend
  | PendingMessaging;

/** Called when the shell refused to send an answer or a prompt: nothing went out. */
export type ShellRefused = (pending: PendingSend, reason: ComputerTunnelRefusal) => void;

/** One open session of the tunnel and the messages that wait for the host's answer in it. */
export class OpenSession {
  readonly generation: number;
  /** The host's `welcome` arrived. */
  welcomed = false;
  /** A session list arrived since `welcome`. */
  listed = false;
  private readonly pending = new Map<string, Pending>();
  private readonly tunnel: ComputerTunnel;
  private readonly nextId: () => string;
  private readonly shellRefused: ShellRefused;

  constructor(
    generation: number,
    tunnel: ComputerTunnel,
    nextId: () => string,
    shellRefused: ShellRefused,
  ) {
    this.generation = generation;
    this.tunnel = tunnel;
    this.nextId = nextId;
    this.shellRefused = shellRefused;
  }

  /** Sends the message `build` makes with a new id, and waits for its answer. */
  send(pending: Pending, build: (id: string) => GatewayClientMessage): void {
    const id = this.nextId();
    this.pending.set(id, pending);
    void this.tunnel.send(this.generation, JSON.stringify(build(id))).then((result) => {
      if (result.sent || this.pending.get(id) !== pending) return;
      this.pending.delete(id);
      if (pending.kind === "messaging") pending.settle({ kind: "not-sent", reason: result.reason });
      else if (pending.kind === "answer" || pending.kind === "prompt") {
        this.shellRefused(pending, result.reason);
      }
    });
  }

  /** Whether a message of `kind` waits for its answer. */
  waitsFor(kind: Pending["kind"]): boolean {
    return [...this.pending.values()].some((pending) => pending.kind === kind);
  }

  /** The message `replyTo` names, still waiting; `undefined` when none waits. */
  waiting(replyTo: string): Pending | undefined {
    return this.pending.get(replyTo);
  }

  /** The message `replyTo` names, no longer waiting; `undefined` when none waits. */
  take(replyTo: string): Pending | undefined {
    const pending = this.pending.get(replyTo);
    this.pending.delete(replyTo);
    return pending;
  }

  /**
   * The session dropped: settles every answer, prompt and Inbox or Messenger
   * request as cut off, never to be sent again; returns the answers' approvals.
   */
  end(): string[] {
    const cutOff: string[] = [];
    for (const pending of this.pending.values()) {
      if (pending.kind === "messaging") pending.settle({ kind: "cut-off" });
      if (pending.kind !== "answer" && pending.kind !== "prompt") continue;
      if (pending.approvalId !== undefined) cutOff.push(pending.approvalId);
      pending.settle({ kind: "cut-off" });
    }
    this.pending.clear();
    return cutOff;
  }
}
