import type {
  GatewayApproval,
  GatewayEventBody,
  GatewaySession,
  HarnessEvent,
  HarnessInput,
  HarnessTask,
} from "@halonicjs/ports";
import { judgeApprovalRisk } from "./approval-risk.ts";

/** One event of a session, numbered in it. */
export interface LedgerEvent {
  readonly seq: number;
  readonly at: string;
  readonly body: GatewayEventBody;
}

/** What {@link RunLedger.watch} answers. */
export type LedgerWatch =
  | { readonly kind: "watching"; readonly stop: () => void }
  | { readonly kind: "history-gone" }
  | { readonly kind: "unknown-session" };

/** How a run ended. */
export type RunOutcome = "done" | "failed";

export interface RunLedgerOptions {
  /** The most events kept for one session; older ones go, except those an unsettled approval needs. */
  maxEvents?: number;
  /** The most finished sessions kept; the one that started longest ago goes first. */
  maxFinished?: number;
  now?: () => Date;
}

const defaultMaxEvents = 500;
const defaultMaxFinished = 20;
const titleLength = 80;
const summaryLength = 300;

interface PendingApproval {
  readonly callId: string;
  readonly approval: GatewayApproval;
  /** The `seq` of its `approval-requested` event. */
  readonly seq: number;
}

interface Watcher {
  readonly onEvent: (event: LedgerEvent) => void;
  /** The `seq` of the last event handed over. */
  delivered: number;
  /** False until the replay may start, which is after `watch` has returned. */
  live: boolean;
  stopped: boolean;
}

/** One run as the gateway sees it. */
class LedgerSession {
  readonly id: string;
  state: GatewaySession["state"] = "running";
  title: string;
  updatedAt: string;
  events: LedgerEvent[] = [];
  nextSeq = 1;
  pending: PendingApproval[] = [];
  nextApproval = 1;
  readonly watchers = new Set<Watcher>();

  constructor(id: string, title: string, at: string) {
    this.id = id;
    this.title = title;
    this.updatedAt = at;
  }

  get lastSeq(): number {
    return this.nextSeq - 1;
  }
}

/**
 * What the remote gateway may know about the runs the host has going
 * (requirement `agent-host.gateway-run-ledger`): each run as a session of a
 * few narrow events, numbered from 1 in it, with the approvals that wait and
 * how risky the host judged each. It only records what the run reports; it
 * can't start, answer or stop anything.
 *
 * A session's id is the id the host gave the run, so a phone's answer reaches
 * the same run a local one would.
 */
export class RunLedger {
  readonly #sessions = new Map<string, LedgerSession>();
  readonly #maxEvents: number;
  readonly #maxFinished: number;
  readonly #now: () => Date;

  constructor(options: RunLedgerOptions = {}) {
    this.#maxEvents = options.maxEvents ?? defaultMaxEvents;
    this.#maxFinished = options.maxFinished ?? defaultMaxFinished;
    this.#now = options.now ?? (() => new Date());
  }

  /** A run has started: its prompt is the first message. */
  started(id: string, task: HarnessTask): void {
    const session = new LedgerSession(id, titleOf(task.prompt), this.#at());
    this.#sessions.set(id, session);
    this.#append(session, { type: "message", role: "user", text: task.prompt });
  }

  /** The run reported `event`. Only some events matter to a phone. */
  event(id: string, event: HarnessEvent): void {
    const session = this.#sessions.get(id);
    if (session === undefined) return;
    if (event.type === "approval.requested") {
      const approval: GatewayApproval = {
        id: `approval-${session.nextApproval++}`,
        summary: shorten(`${event.tool}: ${describe(event.args)}`, summaryLength),
        risk: judgeApprovalRisk(event.tool),
      };
      const seq = this.#append(session, { type: "approval-requested", approval });
      session.pending.push({ callId: event.callId, approval, seq });
      this.#setState(session, "waiting");
    } else if (event.type === "agent.finished" && event.parent === undefined) {
      this.#append(session, { type: "message", role: "agent", text: describe(event.output) });
    }
  }

  /** A person's answer went to the run, from the desktop or a phone. */
  answered(id: string, input: HarnessInput): void {
    const session = this.#sessions.get(id);
    if (session === undefined) return;
    if (input.type === "answer") {
      this.#append(session, { type: "message", role: "user", text: input.text });
      return;
    }
    const waiting = session.pending.find((pending) => pending.callId === input.callId);
    if (waiting === undefined) return;
    this.#settle(session, waiting, input.approved ? "approve" : "deny");
    if (session.pending.length === 0) this.#setState(session, "running");
  }

  /** The run's stream ended; approvals nobody answered end as denied. */
  ended(id: string, outcome: RunOutcome): void {
    const session = this.#sessions.get(id);
    if (session === undefined) return;
    for (const waiting of [...session.pending]) this.#settle(session, waiting, "deny");
    this.#setState(session, outcome);
    this.#forgetOldFinished();
  }

  /** The sessions a phone may see. */
  list(): readonly GatewaySession[] {
    return [...this.#sessions.values()].map((session) => ({
      id: session.id,
      title: session.title,
      state: session.state,
      lastSeq: session.lastSeq,
      updatedAt: session.updatedAt,
    }));
  }

  /**
   * Streams the events after `afterSeq` and then each new one, never calling
   * `onEvent` before this has returned.
   */
  watch(id: string, afterSeq: number, onEvent: (event: LedgerEvent) => void): LedgerWatch {
    const session = this.#sessions.get(id);
    if (session === undefined) return { kind: "unknown-session" };
    const oldest = session.events[0]?.seq ?? session.nextSeq;
    if (afterSeq > 0 && afterSeq < oldest - 1) return { kind: "history-gone" };
    const watcher: Watcher = { onEvent, delivered: afterSeq, live: false, stopped: false };
    session.watchers.add(watcher);
    queueMicrotask(() => {
      watcher.live = true;
      this.#deliver(session, watcher);
    });
    return {
      kind: "watching",
      stop: () => {
        watcher.stopped = true;
        session.watchers.delete(watcher);
      },
    };
  }

  /** The risk of the approval that waits in the session, or `undefined` when none does. */
  approvalRisk(id: string, approvalId: string): "normal" | "risky" | undefined {
    return this.#pendingApproval(id, approvalId)?.approval.risk;
  }

  /** The call id the run knows the approval by, or `undefined` when it doesn't wait. */
  callIdOf(id: string, approvalId: string): string | undefined {
    return this.#pendingApproval(id, approvalId)?.callId;
  }

  #pendingApproval(id: string, approvalId: string): PendingApproval | undefined {
    return this.#sessions.get(id)?.pending.find(({ approval }) => approval.id === approvalId);
  }

  #at(): string {
    return this.#now().toISOString();
  }

  #append(session: LedgerSession, body: GatewayEventBody): number {
    const at = this.#at();
    const seq = session.nextSeq++;
    session.events.push({ seq, at, body });
    session.updatedAt = at;
    this.#trim(session);
    for (const watcher of session.watchers) this.#deliver(session, watcher);
    return seq;
  }

  #setState(session: LedgerSession, state: GatewaySession["state"]): void {
    if (session.state === state) return;
    session.state = state;
    this.#append(session, { type: "state", state });
  }

  #settle(session: LedgerSession, waiting: PendingApproval, decision: "approve" | "deny"): void {
    session.pending = session.pending.filter((pending) => pending !== waiting);
    this.#append(session, {
      type: "approval-settled",
      approvalId: waiting.approval.id,
      decision,
    });
  }

  /** Drops the oldest events past the limit, but never one an unsettled approval still needs. */
  #trim(session: LedgerSession): void {
    const needed = Math.min(...session.pending.map(({ seq }) => seq), session.nextSeq);
    let drop = 0;
    while (
      session.events.length - drop > this.#maxEvents &&
      (session.events[drop]?.seq ?? needed) < needed
    ) {
      drop += 1;
    }
    if (drop > 0) session.events.splice(0, drop);
  }

  #deliver(session: LedgerSession, watcher: Watcher): void {
    if (!watcher.live) return;
    for (const event of session.events) {
      if (watcher.stopped) return;
      if (event.seq <= watcher.delivered) continue;
      watcher.delivered = event.seq;
      watcher.onEvent(event);
    }
  }

  #forgetOldFinished(): void {
    const finished = [...this.#sessions.values()].filter(
      ({ state }) => state === "done" || state === "failed",
    );
    const excess = finished.length - this.#maxFinished;
    for (const session of finished.slice(0, Math.max(0, excess))) this.#sessions.delete(session.id);
  }
}

/** The first line of the prompt, shortened, as the session's title. */
function titleOf(prompt: string): string {
  const firstLine = prompt.trim().split("\n")[0] ?? "";
  return shorten(firstLine === "" ? "Untitled run" : firstLine, titleLength);
}

/** A value as one line of text a person can read. */
function describe(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? "";
}

function shorten(text: string, length: number): string {
  return text.length <= length ? text : `${text.slice(0, length - 1)}…`;
}
