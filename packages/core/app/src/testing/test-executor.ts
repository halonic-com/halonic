import type { PendingApproval, RunStatus, RunSummary } from "@halonicjs/events";
import type {
  RunExecutor,
  RunFilter,
  RunStore,
  SendOptions,
  StartAgentRequest,
  StartRunRequest,
} from "@halonicjs/ports";

/** The events a run that waits for approval accepts: `APPROVAL_EVENTS` in `core/workflow`. */
const approvalEvents: readonly string[] = ["approve", "reject"];

/**
 * A `RunExecutor` that records starts and keeps the port's promise that a
 * repeated `runId` starts nothing, with hooks to fail or hold a start. It
 * also lists its runs by status, as `RunStore.list`; a run stays "running"
 * until {@link TestExecutor.end} ends it. {@link TestExecutor.awaitApproval}
 * makes a run wait for approval, and `send` answers it with the port's
 * `callId` check. For the kernel's own tests. A deliberate fake: core may not use adapters, not
 * even in tests. Running the kernel against real adapters is the targets' job.
 */
export class TestExecutor implements RunExecutor, Pick<RunStore, "list"> {
  readonly id = "test";
  /** Every start request, repeated ones included. */
  readonly requests: (StartRunRequest | StartAgentRequest)[] = [];
  /** The runs that exist, by id. */
  readonly runs = new Map<string, RunSummary>();
  /** A start of this workflow or agent id throws. */
  failOn: string | null = null;
  /** While set, every start waits for it before it does anything: a slow executor. */
  hold: Promise<void> | null = null;

  async start(request: StartRunRequest): Promise<RunSummary> {
    await this.hold;
    return this.record(request, request.workflowId);
  }

  async startAgent(request: StartAgentRequest): Promise<RunSummary> {
    await this.hold;
    return this.record(request, `agent:${request.agentId}`);
  }

  /** As `RunStore.list`, filtering by status only. */
  async list(filter: RunFilter = {}): Promise<RunSummary[]> {
    const { status } = filter;
    const wanted: readonly RunStatus[] = typeof status === "string" ? [status] : (status ?? []);
    return [...this.runs.values()].filter(
      (run) => wanted.length === 0 || wanted.includes(run.status),
    );
  }

  /** Ends a run, as if it finished. */
  end(runId: string, status: RunStatus = "completed"): void {
    const run = this.existing(runId);
    this.runs.set(runId, { ...run, status });
  }

  /** Makes a run wait for a person's OK on the tool call `callId`, after any it already waits on. */
  awaitApproval(runId: string, callId: string): void {
    const run = this.existing(runId);
    const approval: PendingApproval = {
      agent: "agent",
      tool: "tool",
      args: {},
      callId,
      at: "",
      state: "review",
      branch: null,
      item: null,
    };
    this.runs.set(runId, {
      ...run,
      status: "waiting",
      accepts: [...approvalEvents],
      approvals: [...run.approvals, approval],
    });
  }

  /** Answers a run's approval; everything is checked before the run changes, as the port asks. */
  async send(
    runId: string,
    event: string,
    _payload?: unknown,
    options: SendOptions = {},
  ): Promise<RunSummary> {
    const run = this.existing(runId);
    if (run.status !== "waiting" || !run.accepts.includes(event)) {
      throw new Error(`run ${runId} doesn't accept "${event}" now`);
    }
    // Without a call id, the oldest approval is the one answered, as before `SendOptions`.
    const answered =
      options.callId === undefined
        ? run.approvals[0]
        : run.approvals.find((approval) => approval.callId === options.callId);
    if (answered === undefined && options.callId !== undefined) {
      // The code the kernel will use for this refusal (HAL-186, 3(c)).
      throw new Error(
        `engine.decision-callid-must-match: run ${runId} doesn't wait on call ${options.callId}`,
      );
    }
    if (answered === undefined) {
      throw new Error(`run ${runId} waits on no approval`);
    }
    const approvals = run.approvals.filter((approval) => approval !== answered);
    const next: RunSummary =
      approvals.length > 0
        ? { ...run, approvals }
        : { ...run, status: "running", accepts: [], approvals };
    this.runs.set(runId, next);
    return next;
  }

  subscribe(): never {
    throw new Error("not used by the kernel");
  }

  chatTurn(): Promise<never> {
    return Promise.reject(new Error("not used by the kernel"));
  }

  private existing(runId: string): RunSummary {
    const run = this.runs.get(runId);
    if (run === undefined) {
      throw new Error(`no such run: ${runId}`);
    }
    return run;
  }

  private record(request: StartRunRequest | StartAgentRequest, workflowId: string): RunSummary {
    this.requests.push(request);
    if (workflowId === this.failOn || workflowId === `agent:${this.failOn}`) {
      throw new Error(`no such workflow: ${workflowId}`);
    }
    const id = request.runId ?? `run_${this.runs.size + 1}`;
    const existing = this.runs.get(id);
    if (existing !== undefined) {
      return existing;
    }
    const summary = testSummary(id, request.hubId, workflowId, request.trigger ?? null);
    this.runs.set(id, summary);
    return summary;
  }
}

function testSummary(
  id: string,
  hubId: string,
  workflowId: string,
  trigger: RunSummary["trigger"],
): RunSummary {
  return {
    id,
    hubId,
    workflowId,
    kind: "run",
    status: "running",
    state: null,
    startedAt: trigger?.at ?? "",
    endedAt: null,
    usage: { inputTokens: 0, outputTokens: 0 },
    cost: 0,
    unpricedCalls: 0,
    subscriptionCalls: 0,
    statesVisited: [],
    context: {},
    error: null,
    reason: null,
    definitionsVersion: "test",
    trigger,
    parentRunId: null,
    waitingOn: null,
    accepts: [],
    answerLabels: {},
    nextTimer: null,
    waitingFor: null,
    lastWaitingAt: null,
    approvals: [],
    signals: [],
    cantTry: [],
    lastSeq: 1,
    updatedAt: trigger?.at ?? "",
  };
}
