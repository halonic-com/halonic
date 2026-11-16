import type { GatewayEventBody, GatewaySession } from "@halonicjs/ports";
import type {
  GatewaySessionEvent,
  GatewaySessionSource,
  GatewayWatchResult,
} from "./session-source.ts";

interface FakeSession {
  info: GatewaySession;
  events: GatewaySessionEvent[];
  /** Events before this `seq` are gone. */
  firstKept: number;
  watchers: Set<(event: GatewaySessionEvent) => void>;
  /** Told when events a watcher hadn't been given are forgotten. */
  gone: Set<() => void>;
}

/** A session source that keeps everything in memory, for the gateway's tests. */
export class FakeSource implements GatewaySessionSource {
  readonly prompts: { sessionId: string; text: string }[] = [];
  readonly answers: { approvalId: string; decision: string }[] = [];
  failAnswers = false;
  private readonly sessions = new Map<string, FakeSession>();
  private readonly approvals = new Map<string, "normal" | "risky">();

  addSession(id: string): void {
    const info: GatewaySession = {
      id,
      title: `Session ${id}`,
      state: "running",
      lastSeq: 0,
      updatedAt: "2026-11-16T08:00:00Z",
    };
    this.sessions.set(id, { info, events: [], firstKept: 1, watchers: new Set(), gone: new Set() });
  }

  /** Adds an event; a watcher hears it in the next microtask. */
  emit(sessionId: string, body: GatewayEventBody): void {
    const session = this.sessions.get(sessionId);
    if (session === undefined) throw new Error("no such session");
    const event = { seq: session.info.lastSeq + 1, at: "2026-11-16T08:00:01Z", body };
    session.info = { ...session.info, lastSeq: event.seq };
    session.events.push(event);
    if (body.type === "approval-requested") {
      this.approvals.set(`${sessionId}/${body.approval.id}`, body.approval.risk);
    }
    for (const watcher of session.watchers) queueMicrotask(() => watcher(event));
  }

  /** Forgets every event before `seq`; each watch is ended and told, as a real source does. */
  forgetBefore(sessionId: string, seq: number): void {
    const session = this.sessions.get(sessionId);
    if (session === undefined) throw new Error("no such session");
    session.firstKept = seq;
    session.events = session.events.filter((event) => event.seq >= seq);
    for (const told of [...session.gone]) told();
  }

  watcherCount(sessionId: string): number {
    return this.sessions.get(sessionId)?.watchers.size ?? 0;
  }

  list(): readonly GatewaySession[] {
    return [...this.sessions.values()].map((session) => session.info);
  }

  watch(
    sessionId: string,
    afterSeq: number,
    onEvent: (event: GatewaySessionEvent) => void,
    onHistoryGone: () => void,
  ): GatewayWatchResult {
    const session = this.sessions.get(sessionId);
    if (session === undefined) return { kind: "unknown-session" };
    if (afterSeq > 0 && afterSeq + 1 < session.firstKept) return { kind: "history-gone" };
    const replay = session.events.filter((event) => event.seq > afterSeq);
    queueMicrotask(() => {
      for (const event of replay) onEvent(event);
    });
    const live = (event: GatewaySessionEvent) => {
      if (!replay.includes(event)) onEvent(event);
    };
    const gone = () => {
      session.watchers.delete(live);
      session.gone.delete(gone);
      onHistoryGone();
    };
    session.watchers.add(live);
    session.gone.add(gone);
    return {
      kind: "watching",
      stop: () => {
        session.watchers.delete(live);
        session.gone.delete(gone);
      },
    };
  }

  approvalRisk(sessionId: string, approvalId: string): "normal" | "risky" | undefined {
    return this.approvals.get(`${sessionId}/${approvalId}`);
  }

  async answerApproval(
    sessionId: string,
    approvalId: string,
    decision: "approve" | "deny",
  ): Promise<void> {
    if (this.failAnswers) throw new Error("settled");
    this.answers.push({ approvalId, decision });
    this.approvals.delete(`${sessionId}/${approvalId}`);
  }

  async sendPrompt(sessionId: string, text: string): Promise<void> {
    if (!this.sessions.has(sessionId)) throw new Error("no such session");
    this.prompts.push({ sessionId, text });
  }
}
