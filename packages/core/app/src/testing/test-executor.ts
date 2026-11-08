import type { RunSummary } from "@halonicjs/events";
import type { RunExecutor, StartAgentRequest, StartRunRequest } from "@halonicjs/ports";

/**
 * A `RunExecutor` that records starts and keeps the port's promise that a
 * repeated `runId` starts nothing. For the kernel's own tests; the memory
 * adapters take over once they are on this package's base.
 */
export class TestExecutor implements RunExecutor {
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
    approval: null,
    signals: [],
    lastSeq: 1,
    updatedAt: trigger?.at ?? "",
  };
}
