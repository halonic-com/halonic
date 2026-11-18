import type {
  BridgeApprovalDecision,
  BridgeApprovalRequest,
  GatewayApproval,
  GatewayEventBody,
  GatewaySession,
  HarnessEvent,
  HarnessInput,
  HarnessTask,
} from "@halonicjs/ports";
import { gatewayMaxMessageBytes } from "@halonicjs/ports";
import type { DecideRemotely } from "../bridge/studio-services.ts";
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
  /** Where a fault in a watcher's callback is written. */
  log?: (text: string) => void;
}

const defaultMaxEvents = 500;
const defaultMaxFinished = 20;
const titleLength = 80;
const summaryLength = 300;
/** What the `sessions` reply may spend on its sessions: its message limit, less the envelope. */
const sessionsBudgetBytes = gatewayMaxMessageBytes - 1024;

/** The call an approval is asked for, as the run's event and the bridge's request both name it. */
type AskedCall = Pick<BridgeApprovalRequest, "callId" | "tool" | "connector" | "args">;

interface PendingApproval {
  /** Where the approval is decided: by the run as an event, or at the bridge. */
  readonly via: "run" | "bridge";
  readonly callId: string;
  readonly approval: GatewayApproval;
  /** How a remote device's decision reaches Studio; only an approval at the bridge has it. */
  readonly decide?: DecideRemotely;
  /** The `seq` of its `approval-requested` event. */
  readonly seq: number;
}

interface Watcher {
  readonly onEvent: (event: LedgerEvent) => void;
  /** Told once when events the watcher hadn't seen were trimmed; it is stopped after. */
  readonly onHistoryGone: (() => void) | undefined;
  /** The `seq` of the last event handed over. */
  delivered: number;
  /** False until the replay may start, which is after `watch` has returned. */
  live: boolean;
  stopped: boolean;
}

/** One run as the gateway sees it. */
class LedgerSession {
  readonly id: string;
  /** The engine's run and the agent the harness run works as; a bridge names its approvals by them. */
  readonly runId: string;
  readonly agentId: string;
  state: GatewaySession["state"] = "running";
  title: string;
  updatedAt: string;
  events: LedgerEvent[] = [];
  nextSeq = 1;
  pending: PendingApproval[] = [];
  nextApproval = 1;
  readonly watchers = new Set<Watcher>();

  constructor(id: string, task: HarnessTask, title: string, at: string) {
    this.id = id;
    this.runId = task.runId;
    this.agentId = task.agentId;
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
  readonly #log: (text: string) => void;

  constructor(options: RunLedgerOptions = {}) {
    this.#maxEvents = options.maxEvents ?? defaultMaxEvents;
    this.#maxFinished = options.maxFinished ?? defaultMaxFinished;
    this.#now = options.now ?? (() => new Date());
    this.#log = options.log ?? ((text) => process.stderr.write(text));
  }

  /** A run has started: its prompt is the first message. */
  started(id: string, task: HarnessTask): void {
    const session = new LedgerSession(id, task, titleOf(task.prompt), this.#at());
    this.#sessions.set(id, session);
    this.#append(session, { type: "message", role: "user", text: task.prompt });
  }

  /** The run reported `event`. Only some events matter to a phone. */
  event(id: string, event: HarnessEvent): void {
    const session = this.#sessions.get(id);
    if (session === undefined) return;
    if (event.type === "approval.requested") {
      this.#ask(session, "run", event);
    } else if (event.type === "agent.finished" && event.parent === undefined) {
      this.#append(session, { type: "message", role: "agent", text: describe(event.output) });
    }
  }

  /**
   * A bridge asked a person to approve a call, as Claude Code's tools and
   * Halonic's own tools do for every harness. The bridge names the engine's
   * run and the agent, not the host's run id, so the session is the one that
   * run started for that agent.
   */
  bridgeApprovalAsked(
    runId: string,
    agentId: string,
    request: BridgeApprovalRequest,
    decide: DecideRemotely,
  ): void {
    const session = this.#runningSessionOf(runId, agentId);
    if (session === undefined) return;
    this.#ask(session, "bridge", request, decide);
  }

  /**
   * The bridge's call for an approval ended: with the person's decision, or
   * with none (`undefined`) because the call was cancelled or failed, which
   * counts as denied.
   */
  bridgeApprovalEnded(
    runId: string,
    agentId: string,
    callId: string,
    decision: BridgeApprovalDecision | undefined,
  ): void {
    const session = this.#runningSessionOf(runId, agentId);
    const waiting = session?.pending.find((p) => p.via === "bridge" && p.callId === callId);
    if (session === undefined || waiting === undefined) return;
    this.#settle(session, waiting, decision?.approved === true ? "approve" : "deny");
    if (session.pending.length === 0) this.#setState(session, "running");
  }

  /** A person's answer went to the run, from the desktop or a phone. */
  answered(id: string, input: HarnessInput): void {
    const session = this.#sessions.get(id);
    if (session === undefined) return;
    if (input.type === "answer") {
      this.#append(session, { type: "message", role: "user", text: input.text });
      return;
    }
    const waiting = session.pending.find(
      (pending) => pending.via === "run" && pending.callId === input.callId,
    );
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

  /**
   * The sessions a phone may see, oldest first. The newest ones that fit in
   * one `sessions` reply are listed; a session older than those isn't, so the
   * reply never goes over {@link gatewayMaxMessageBytes}.
   */
  list(): readonly GatewaySession[] {
    const newestFirst = [...this.#sessions.values()].reverse().map(
      (session): GatewaySession => ({
        id: session.id,
        title: session.title,
        state: session.state,
        lastSeq: session.lastSeq,
        updatedAt: session.updatedAt,
      }),
    );
    const listed: GatewaySession[] = [];
    let bytes = 0;
    for (const session of newestFirst) {
      bytes += Buffer.byteLength(JSON.stringify(session)) + 1;
      if (bytes > sessionsBudgetBytes) break;
      listed.push(session);
    }
    return listed.reverse();
  }

  /**
   * Streams the events after `afterSeq` and then each new one, never calling
   * `onEvent` before this has returned. An error `onEvent` throws is logged and
   * dropped. A `afterSeq` past the last event is `history-gone`, as the phone
   * knows a session this host doesn't. When events the watcher hadn't seen are
   * trimmed, `onHistoryGone` is called and the watch ends.
   */
  watch(
    id: string,
    afterSeq: number,
    onEvent: (event: LedgerEvent) => void,
    onHistoryGone?: () => void,
  ): LedgerWatch {
    const session = this.#sessions.get(id);
    if (session === undefined) return { kind: "unknown-session" };
    const oldest = session.events[0]?.seq ?? session.nextSeq;
    if (afterSeq > session.lastSeq) return { kind: "history-gone" };
    if (afterSeq > 0 && afterSeq < oldest - 1) return { kind: "history-gone" };
    const watcher: Watcher = {
      onEvent,
      onHistoryGone,
      // From 0 the replay starts at the oldest event kept.
      delivered: afterSeq === 0 ? Math.max(0, oldest - 1) : afterSeq,
      live: false,
      stopped: false,
    };
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

  /** How to tell Studio of a remote decision, for an approval at the bridge that still waits. */
  remoteDeciderOf(id: string, approvalId: string): DecideRemotely | undefined {
    return this.#pendingApproval(id, approvalId)?.decide;
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

  /** The newest session of the engine's run and agent that hasn't ended. */
  #runningSessionOf(runId: string, agentId: string): LedgerSession | undefined {
    return [...this.#sessions.values()]
      .reverse()
      .find(
        (session) =>
          session.runId === runId &&
          session.agentId === agentId &&
          (session.state === "running" || session.state === "waiting"),
      );
  }

  #ask(
    session: LedgerSession,
    via: PendingApproval["via"],
    call: AskedCall,
    decide?: DecideRemotely,
  ): void {
    const approval: GatewayApproval = {
      id: `approval-${session.nextApproval++}`,
      summary: shorten(`${call.tool}: ${describe(call.args)}`, summaryLength),
      risk: judgeApprovalRisk(call.tool),
      ...(call.connector === undefined ? {} : { connector: call.connector }),
    };
    const seq = this.#append(session, { type: "approval-requested", approval });
    session.pending.push({
      via,
      callId: call.callId,
      approval,
      seq,
      ...(decide === undefined ? {} : { decide }),
    });
    this.#setState(session, "waiting");
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
    const oldest = session.events[0]?.seq ?? session.nextSeq;
    if (watcher.delivered < oldest - 1) {
      watcher.stopped = true;
      session.watchers.delete(watcher);
      this.#guarded(() => watcher.onHistoryGone?.());
      return;
    }
    for (const event of session.events) {
      if (watcher.stopped) return;
      if (event.seq <= watcher.delivered) continue;
      watcher.delivered = event.seq;
      this.#guarded(() => watcher.onEvent(event));
    }
  }

  /** Runs a watcher's callback so that its fault never breaks the run that is recorded. */
  #guarded(call: () => void): void {
    try {
      call();
    } catch (error) {
      this.#log(
        `A gateway watcher failed: ${error instanceof Error ? error.message : String(error)}\n`,
      );
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
