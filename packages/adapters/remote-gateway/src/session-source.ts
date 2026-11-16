import type { GatewayEventBody, GatewaySession } from "@halonicjs/ports";

/** One event of a session, as the gateway passes it on: the protocol's `event` without its session. */
export interface GatewaySessionEvent {
  readonly seq: number;
  readonly at: string;
  readonly body: GatewayEventBody;
}

/** What {@link GatewaySessionSource.watch} answers. */
export type GatewayWatchResult =
  /** Events are on their way; `stop` ends the watch. */
  | { readonly kind: "watching"; readonly stop: () => void }
  /** The events after `afterSeq` are no longer kept. */
  | { readonly kind: "history-gone" }
  | { readonly kind: "unknown-session" };

/**
 * What the gateway may ask of the host, and all it may ask. The host
 * implements it on its own sessions, approvals and trust gate, so a remote
 * prompt or answer takes the same road as a local one. There is deliberately
 * nothing here to run a command, touch a file or read a secret.
 */
export interface GatewaySessionSource {
  /** The sessions a phone may see. */
  list(): readonly GatewaySession[];
  /**
   * Streams the session's events after `afterSeq` in order, one `seq` after
   * the other with none missing, then each new one. Starts with the oldest
   * kept event when `afterSeq` is 0. Calls `onEvent` only after it has
   * returned.
   *
   * When events the watch hadn't yet been given are dropped from the
   * session's history, the source ends the watch and calls `onHistoryGone`
   * once, so the gateway never passes on a gap.
   */
  watch(
    sessionId: string,
    afterSeq: number,
    onEvent: (event: GatewaySessionEvent) => void,
    onHistoryGone: () => void,
  ): GatewayWatchResult;
  /**
   * How risky the approval is, as the host judged it, or `undefined` when no
   * such approval waits for an answer (unknown, or already settled).
   */
  approvalRisk(sessionId: string, approvalId: string): "normal" | "risky" | undefined;
  /** Passes a person's decision on to the session. Rejects when the approval was settled meanwhile. */
  answerApproval(
    sessionId: string,
    approvalId: string,
    decision: "approve" | "deny",
  ): Promise<void>;
  /** Passes the person's next message to the session. Rejects when the session can't take one. */
  sendPrompt(sessionId: string, text: string): Promise<void>;
}

/** What the person decided on the desktop about the gateway. */
export interface GatewayPolicy {
  /**
   * Whether a phone may answer an approval the host judged `risky`. Off
   * until the person allows it, for this host, on the desktop.
   */
  allowRiskyRemotely(): boolean;
}
