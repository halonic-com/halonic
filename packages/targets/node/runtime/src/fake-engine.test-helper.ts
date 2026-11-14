import type { RunEvent, RunSummary } from "@halonicjs/events";
import {
  type ChatTurnRequest,
  type ChatTurnResponse,
  type RunEventListener,
  type RunExecutor,
  type RunSubscription,
  RunTargetNotFound,
  type SendOptions,
  type StartAgentRequest,
  type StartRunRequest,
} from "@halonicjs/ports";

/**
 * The engine behind a served test host: a few runs that can wait for approval,
 * with an event log per run that `subscribe` replays after a `seq`. It keeps the
 * port's rules (a missing target is `RunTargetNotFound`, `send` checks the
 * call id), so the remote executor in front of it meets the shared contract.
 */
export class FakeEngine implements RunExecutor {
  readonly id = "fake-engine";
  readonly runs = new Map<string, RunSummary>();
  readonly #events = new Map<string, RunEvent[]>();
  readonly #listeners = new Map<string, Set<RunEventListener>>();
  /** What the last chat turn got, so a test can see the abort reach the engine. */
  lastTurnSignal: AbortSignal | undefined;
  /** While set, a chat turn waits until its signal aborts and then rejects, like a slow model call. */
  holdTurns = false;
  #next = 1;

  async start(request: StartRunRequest): Promise<RunSummary> {
    if (request.hubId !== "acme") throw new RunTargetNotFound("hub", request.hubId, "no hub");
    if (request.workflowId !== "review") {
      throw new RunTargetNotFound("workflow", request.workflowId, "no workflow");
    }
    return this.#create(request.hubId, request.workflowId);
  }

  async startAgent(request: StartAgentRequest): Promise<RunSummary> {
    if (request.hubId !== "acme") throw new RunTargetNotFound("hub", request.hubId, "no hub");
    if (request.agentId !== "scribe") {
      throw new RunTargetNotFound("agent", request.agentId, "no agent");
    }
    return this.#create(request.hubId, `agent:${request.agentId}`);
  }

  /** Makes a run wait for approval of `callId`. */
  awaitApproval(runId: string, callId: string): void {
    const run = this.#existing(runId);
    this.runs.set(runId, {
      ...run,
      status: "waiting",
      accepts: ["approve", "reject"],
      approvals: [{ callId } as RunSummary["approvals"][number]],
    });
  }

  async send(
    runId: string,
    event: string,
    _payload?: unknown,
    options: SendOptions = {},
  ): Promise<RunSummary> {
    const run = this.#existing(runId);
    const waitsOn = run.approvals[0]?.callId;
    if (run.status !== "waiting" || !run.accepts.includes(event)) {
      throw new Error(`run ${runId} doesn't accept "${event}" now`);
    }
    if (options.callId !== undefined && options.callId !== waitsOn) {
      throw new Error(`run ${runId} doesn't wait on call ${options.callId}`);
    }
    const next = { ...run, status: "running", accepts: [], approvals: [] } as RunSummary;
    this.runs.set(runId, next);
    return next;
  }

  async cancel(runId: string): Promise<RunSummary> {
    const run = this.#existing(runId);
    const next = { ...run, status: "failed" } as RunSummary;
    this.runs.set(runId, next);
    this.end(runId);
    return next;
  }

  /** Appends an event to a run's log and tells the followers. */
  append(runId: string, event: RunEvent): void {
    this.#events.get(runId)?.push(event);
    for (const listener of this.#listeners.get(runId) ?? []) listener.onEvent(event);
  }

  /** Ends every follower of a run, as a finished run does. */
  end(runId: string): void {
    for (const listener of this.#listeners.get(runId) ?? []) listener.onClose();
    this.#listeners.delete(runId);
  }

  subscribe(runId: string, afterSeq: number, listener: RunEventListener): RunSubscription {
    const log = this.#events.get(runId) ?? [];
    const set = this.#listeners.get(runId) ?? new Set();
    this.#listeners.set(runId, set);
    // The port promises not to call the listener before `subscribe` returns.
    queueMicrotask(() => {
      for (const event of log.filter((logged) => logged.seq > afterSeq)) listener.onEvent(event);
      if (this.runs.get(runId)?.status === "completed") listener.onClose();
      else set.add(listener);
    });
    return { close: () => set.delete(listener) && undefined };
  }

  async chatTurn(request: ChatTurnRequest): Promise<ChatTurnResponse> {
    this.lastTurnSignal = request.signal;
    const { signal } = request;
    if (this.holdTurns && signal !== undefined) {
      await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve()));
      throw new Error("the model call was aborted");
    }
    return { content: "hello", toolCalls: [], finishReason: "stop", model: "test" } as never;
  }

  #create(hubId: string, workflowId: string): RunSummary {
    const id = `run_${this.#next++}`;
    const summary = {
      id,
      hubId,
      workflowId,
      status: "running",
      accepts: [],
      approvals: [],
    } as unknown as RunSummary;
    this.runs.set(id, summary);
    this.#events.set(id, []);
    return summary;
  }

  #existing(runId: string): RunSummary {
    const run = this.runs.get(runId);
    if (run === undefined) throw new Error(`no such run: ${runId}`);
    return run;
  }
}
