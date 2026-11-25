import {
  type GatewayClientMessage,
  type GatewayHostMessage,
  type GatewaySession,
  gatewayFallbackProtocolVersion,
  gatewayMaxPromptLength,
  gatewayProtocolVersion,
} from "@halonicjs/ports";
import type { ComputerTunnel, ComputerTunnelEvent } from "./computer-tunnel.ts";
import { parseHostMessage } from "./host-message.ts";
import { MessagingClient } from "./messaging-client.ts";
import { OpenSession, type Pending, type PendingSend } from "./open-session.ts";
import type { PhoneState } from "./phone-status.ts";
import type { PhoneRemote, RemoteSendOutcome, RemoteView } from "./remote-view.ts";
import { SentAnswers } from "./sent-answers.ts";
import type { SessionMemory } from "./session-memory.ts";
import { viewOf } from "./view-of.ts";
import { Watches } from "./watches.ts";

/** How often the phone asks for the session list while connected and in front. */
export const listEveryMs = 15_000;

/**
 * The phone's gateway client for one paired computer (tunnel D7, design on
 * HAL-15159, sections 2 and 3). It speaks the remote gateway protocol over
 * the shell's {@link ComputerTunnel} and turns what the host sends, and the
 * connection's state, into the {@link RemoteView} the screens show.
 *
 * - On every `session-opened` it sends `hello`; after `welcome`, `list-sessions`,
 *   then again every 15 seconds while connected and in front.
 * - It watches up to 16 running or waiting sessions, each from the last `seq`
 *   it holds, and from 0 after `history-gone` or a gap.
 * - Answers and prompts are never sent twice; one cut off by a drop is
 *   settled by what the reconnect shows.
 * - Any host message it refuses, or one that answers nothing it sent, ends
 *   the session; the shell reconnects with its own backoff.
 *
 * Everything lives in memory only.
 */
export class GatewayClient implements PhoneRemote {
  private state: PhoneState = "reconnecting";
  private session: OpenSession | undefined;
  private inFront = true;
  private nextId = 1;
  private asOf: Date | undefined;
  private sessions: readonly GatewaySession[] = [];
  /** What the last session list said of the risky switch: only a hint for the view. */
  private answersRisky = false;
  /** Whether the owner check could ask, checked again after every session list. */
  private ownerCheckAvailable = false;
  /** Counts the owner checks asked for, so an older answer never overwrites a newer one. */
  private ownerChecks = 0;
  /** The last connection found the computer on another message version. */
  private updateNeeded = false;
  /** The message version the open session's `hello` named. */
  private speaking = gatewayProtocolVersion;
  /** The computer refused version 4, so the next session says `hello` with version 3 once. */
  private fallBackNext = false;
  /** The last `welcome` was version 3's: the computer serves Agents only, no Inbox or Messenger. */
  private olderComputer = false;
  private readonly memories = new Map<string, SessionMemory>();
  private readonly sentAnswers = new SentAnswers();
  private readonly watches = new Watches(this.memories);
  private listTimer: ReturnType<typeof setInterval> | undefined;
  private snapshot: RemoteView;
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribe: () => void;
  /** The Inbox and Messenger over message version 4; it sends nothing while the computer speaks version 3. */
  readonly messaging = new MessagingClient(() => {
    if (this.olderComputer) return "older";
    return this.session?.welcomed === true ? this.session : undefined;
  });

  private readonly tunnel: ComputerTunnel;
  /** The computer's name, for the header label. */
  private readonly computer: string;
  private readonly ownerCheck: OwnerCheckAvailable;

  /**
   * `ownerCheck` asks the shell whether the phone's owner check can ask now;
   * without one it never can, and every `risky` approval stays on the computer.
   */
  constructor(tunnel: ComputerTunnel, computer: string, ownerCheck: OwnerCheckAvailable = never) {
    this.tunnel = tunnel;
    this.computer = computer;
    this.ownerCheck = ownerCheck;
    this.snapshot = this.build();
    this.unsubscribe = tunnel.subscribe((event) => this.receive(event));
  }

  view(): RemoteView {
    return this.snapshot;
  }

  subscribe(onChange: () => void): () => void {
    this.listeners.add(onChange);
    return () => this.listeners.delete(onChange);
  }

  answer(
    sessionId: string,
    approvalId: string,
    decision: "approve" | "deny",
  ): Promise<RemoteSendOutcome> {
    const open = this.snapshot.openApprovals.find(
      (candidate) => candidate.sessionId === sessionId && candidate.approval.id === approvalId,
    );
    if (open === undefined || !open.canAnswer) return notSent("off");
    this.sentAnswers.sent(approvalId, sessionId, decision);
    this.changed();
    return this.request({ kind: "answer", approvalId }, (id) => ({
      type: "answer-approval",
      id,
      sessionId,
      approvalId,
      decision,
    }));
  }

  prompt(sessionId: string, text: string): Promise<RemoteSendOutcome> {
    if (text.trim() === "" || text.length > gatewayMaxPromptLength) return notSent("invalid");
    if (!this.snapshot.canAnswer) return notSent("off");
    return this.request({ kind: "prompt" }, (id) => ({ type: "prompt", id, sessionId, text }));
  }

  /** Whether the app is in front; the session list is asked for only while it is. */
  setInFront(inFront: boolean): void {
    this.inFront = inFront;
    this.planListing();
  }

  /** Stops listening to the tunnel and drops everything, as when the computer is removed. */
  dispose(): void {
    this.unsubscribe();
    this.drop();
    this.forget();
  }

  private receive(event: ComputerTunnelEvent): void {
    if (event.kind === "status") this.statusChanged(event.state);
    else if (event.kind === "session-opened") this.opened(event.generation);
    else if (event.generation === this.session?.generation) this.read(event.text);
    this.changed();
  }

  private statusChanged(state: PhoneState): void {
    this.state = state;
    if (state !== "connected") this.drop();
    if (state === "removed") this.forget();
    this.planListing();
  }

  private opened(generation: number): void {
    this.drop();
    this.session = new OpenSession(
      generation,
      this.tunnel,
      () => this.newId(),
      (pending, reason) => this.notSent(pending, { kind: "not-sent", reason }),
    );
    // Every session tries version 4 first, so a computer updated since is found at once.
    this.speaking = this.fallBackNext ? gatewayFallbackProtocolVersion : gatewayProtocolVersion;
    this.fallBackNext = false;
    const version = this.speaking;
    this.send({ kind: "hello" }, (id) => ({ type: "hello", id, version }));
  }

  private read(text: string): void {
    const result = parseHostMessage(text, this.speaking);
    if (!result.ok && result.problem === "other-version") this.updateNeeded = true;
    if (!result.ok || !this.handle(result.message)) this.disconnect();
  }

  /** Acts on one host message; `false` when it doesn't fit what the phone sent. */
  private handle(message: GatewayHostMessage): boolean {
    switch (message.type) {
      case "welcome":
        return this.welcomed(message.replyTo);
      case "sessions":
        return this.listed(message);
      case "event":
        return this.eventArrived(message);
      case "ok":
        return this.answered(message.replyTo, { kind: "done" });
      case "error":
        if ("replyTo" in message) {
          return this.answered(message.replyTo, { kind: "refused", code: message.code });
        }
        // The host closes after any error without `replyTo`; this one says why.
        if (message.code === "unsupported-version") this.versionRefused();
        return true;
      case "msg-data":
      case "msg-result":
      case "msg-changed":
        return this.messaging.received(message);
      default:
        // Pairing messages come only while pairing, which isn't this client's.
        return false;
    }
  }

  private welcomed(replyTo: string): boolean {
    if (this.session?.take(replyTo)?.kind !== "hello") return false;
    this.session.welcomed = true;
    this.updateNeeded = false;
    this.olderComputer = this.speaking === gatewayFallbackProtocolVersion;
    this.messaging.welcomed();
    this.listSessions();
    this.planListing();
    return true;
  }

  /**
   * The computer closes on the `hello`'s version. A version 4 phone tries
   * version 3 on the next session, for one release (`ports.remote-gateway-protocol`);
   * only when that is refused too does it say an update is needed.
   */
  private versionRefused(): void {
    if (this.speaking === gatewayProtocolVersion) this.fallBackNext = true;
    else this.updateNeeded = true;
  }

  /**
   * Takes a session list: one that answers the phone's `list-sessions`, or one
   * the host pushed after its risky switch changed, which counts only after
   * `welcome`. Either replaces the whole list.
   */
  private listed(message: Extract<GatewayHostMessage, { type: "sessions" }>): boolean {
    const { replyTo, sessions } = message;
    if (this.session === undefined) return false;
    if (replyTo === undefined) {
      if (!this.session.welcomed) return false;
    } else if (this.session.take(replyTo)?.kind !== "list") {
      return false;
    }
    const firstSinceWelcome = !this.session.listed;
    this.session.listed = true;
    this.sessions = sessions;
    this.answersRisky = message.answersRisky;
    this.checkOwner();
    if (firstSinceWelcome) {
      this.sentAnswers.listed((id) => sessions.find((session) => session.id === id)?.lastSeq);
    }
    const plan = this.watches.plan(sessions);
    for (const sessionId of plan.unwatch) {
      this.send({ kind: "unwatch", sessionId }, (id) => ({ type: "unwatch", id, sessionId }));
    }
    for (const sessionId of plan.watch) this.watch(sessionId);
    // A resumed session may already hold its listed `lastSeq` and get no new
    // event, so a cut-off answer is settled here, not only as events arrive.
    for (const [sessionId, memory] of this.memories) {
      this.sentAnswers.caughtUp(sessionId, memory.lastSeq);
    }
    return this.touched();
  }

  private eventArrived(message: Extract<GatewayHostMessage, { type: "event" }>): boolean {
    const { sessionId, seq, body } = message;
    const result = this.watches.eventArrived(message);
    if (result === "gap") this.watch(sessionId);
    if (result !== "held") return true;
    if (body.type === "approval-settled") this.sentAnswers.settled(body.approvalId);
    this.sentAnswers.caughtUp(sessionId, seq);
    return this.touched();
  }

  /** Settles the message `replyTo` names with the host's `ok` or refusal. */
  private answered(replyTo: string, outcome: RemoteSendOutcome): boolean {
    const pending = this.session?.take(replyTo);
    if (pending === undefined) return false;
    switch (pending.kind) {
      case "hello":
      case "list":
        // `welcome` and `sessions` answer these; the host never refuses them.
        return false;
      case "watch":
        if (outcome.kind === "done") this.watches.confirmed(pending.sessionId);
        else if (
          outcome.kind === "refused" &&
          this.watches.refused(pending.sessionId, outcome.code)
        ) {
          this.watch(pending.sessionId);
        }
        return true;
      case "unwatch":
        this.watches.unwatched(pending.sessionId);
        return true;
      case "messaging":
        return this.messaging.answered(
          pending,
          outcome.kind === "refused" ? outcome : { type: "ok", replyTo },
        );
      default:
        if (outcome.kind === "refused") this.notSent(pending, outcome);
        else pending.settle(outcome);
        return true;
    }
  }

  /**
   * Asks again whether the owner check can ask, after every session list: a
   * fingerprint removed since the last list turns Approve off for `risky`
   * approvals. Until the answer comes they stay off; any error reads as no.
   */
  private checkOwner(): void {
    this.ownerChecks += 1;
    const asked = this.ownerChecks;
    this.ownerCheckAvailable = false;
    const settle = (available: boolean) => {
      if (asked !== this.ownerChecks) return;
      this.ownerCheckAvailable = available;
      this.changed();
    };
    this.ownerCheck().then(
      (available) => settle(available === true),
      () => settle(false),
    );
  }

  private watch(sessionId: string): void {
    const afterSeq = this.watches.watching(sessionId);
    this.send({ kind: "watch", sessionId }, (id) => ({ type: "watch", id, sessionId, afterSeq }));
  }

  private listSessions(): void {
    if (this.session?.waitsFor("list") !== false) return;
    this.send({ kind: "list" }, (id) => ({ type: "list-sessions", id }));
  }

  /** Lists every 15 seconds while connected, welcomed and in front, and not otherwise. */
  private planListing(): void {
    const listing = this.state === "connected" && this.session?.welcomed === true && this.inFront;
    if (listing && this.listTimer === undefined) {
      this.listTimer = setInterval(() => {
        this.listSessions();
      }, listEveryMs);
    } else if (!listing && this.listTimer !== undefined) {
      clearInterval(this.listTimer);
      this.listTimer = undefined;
    }
  }

  /** Sends an answer or a prompt; the host, the shell or a drop settles the returned promise. */
  private request(
    pending: Omit<PendingSend, "settle">,
    build: (id: string) => GatewayClientMessage,
  ): Promise<RemoteSendOutcome> {
    return new Promise((settle) => {
      const sending = { ...pending, settle };
      if (this.session === undefined)
        this.notSent(sending, { kind: "not-sent", reason: "not-open" });
      else this.session.send(sending, build);
    });
  }

  private send(pending: Pending, build: (id: string) => GatewayClientMessage): void {
    this.session?.send(pending, build);
  }

  /** An answer or a prompt the host or the shell refused: nothing landed, so it may be sent again. */
  private notSent(pending: PendingSend, outcome: RemoteSendOutcome): void {
    if (pending.approvalId !== undefined) this.sentAnswers.refused(pending.approvalId);
    pending.settle(outcome);
    this.changed();
  }

  private newId(): string {
    const id = `p-${this.nextId}`;
    this.nextId += 1;
    return id;
  }

  /** Ends the session after a host message the phone refused. */
  private disconnect(): void {
    const generation = this.session?.generation;
    this.drop();
    if (generation !== undefined) void this.tunnel.endSession(generation);
  }

  /** The session dropped: what waited for an answer was cut off, and nothing is resent. */
  private drop(): void {
    const session = this.session;
    if (session === undefined) return;
    this.session = undefined;
    this.sentAnswers.dropped(session.end());
    this.watches.dropped();
    this.planListing();
  }

  /** Forgets the computer's sessions, as when it is removed. */
  private forget(): void {
    this.sessions = [];
    this.answersRisky = false;
    this.ownerChecks += 1;
    this.ownerCheckAvailable = false;
    this.memories.clear();
    this.sentAnswers.clear();
    this.asOf = undefined;
    this.olderComputer = false;
    this.fallBackNext = false;
  }

  /** The phone's clock when the last session list or event arrived. */
  private touched(): true {
    this.asOf = new Date();
    return true;
  }

  private build(): RemoteView {
    return viewOf({
      computer: this.computer,
      state: this.state,
      listed: this.session?.listed === true,
      asOf: this.asOf,
      sessions: this.sessions,
      memories: this.memories,
      sentAnswers: this.sentAnswers,
      answersRisky: this.answersRisky,
      ownerCheckAvailable: this.ownerCheckAvailable,
      updateNeeded: this.updateNeeded,
      olderComputer: this.olderComputer,
    });
  }

  private changed(): void {
    this.snapshot = this.build();
    for (const listener of this.listeners) listener();
  }
}

/** Whether the phone's owner check can ask now: the shell's `owner_check_available`. */
export type OwnerCheckAvailable = () => Promise<boolean>;

const never: OwnerCheckAvailable = () => Promise.resolve(false);

function notSent(reason: "off" | "invalid"): Promise<RemoteSendOutcome> {
  return Promise.resolve({ kind: "not-sent", reason });
}
