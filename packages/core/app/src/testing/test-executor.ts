import type { RunStatus, RunSummary } from "@halonicjs/events";
import type {
  RunExecutor,
  RunFilter,
  RunStore,
  StartAgentRequest,
  StartRunRequest,
} from "@halonicjs/ports";

/**
 * A `RunExecutor` that records starts and keeps the port's promise that a
 * repeated `runId` starts nothing, with hooks to fail or hold a start. It
 * also lists its runs by status, as `RunStore.list`; a run stays "running"
 * until {@link TestExecutor.end} ends it. For the kernel's own tests. A deliberate fake: core may not use adapters, not
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
    const run = this.runs.get(runId);
    if (run === undefined) {
      throw new Error(`no such run: ${runId}`);
    }
    this.runs.set(runId, { ...run, status });
  }

  send(): Promise<RunSummary> {
    return Promise.reject(new Error("not used by the kernel"));
  }

  subscribe(): never {
    throw new Error("not used by the kernel");
  }

  chatTurn(): Promise<never> {
    return Promise.reject(new Error("not used by the kernel"));
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
    statesVisited: [],
    context: {},
    error: null,
    definitionsVersion: "test",
    trigger,
    parentRunId: null,
    waitingOn: null,
    accepts: [],
    nextTimer: null,
    lastWaitingAt: null,
    approvals: [],
    signals: [],
    lastSeq: 1,
    updatedAt: trigger?.at ?? "",
  };
}
