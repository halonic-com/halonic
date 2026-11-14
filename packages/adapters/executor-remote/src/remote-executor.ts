import type { RunSummary } from "@halonicjs/events";
import {
  type ChatTurnRequest,
  type ChatTurnResponse,
  type EngineConnection,
  type RunEventListener,
  type RunExecutor,
  type RunSubscription,
  RunTargetNotFound,
  type SendOptions,
  type StartAgentRequest,
  type StartRunRequest,
} from "@halonicjs/ports";
import { ConnectionTracker } from "./connection.ts";
import { RemoteHostError, readHostError } from "./errors.ts";
import { type Fetcher, type HostCall, HostClient } from "./host-client.ts";
import { followRun } from "./run-stream.ts";

/** What {@link createRemoteExecutor} needs. */
export interface RemoteExecutorOptions {
  /** The host's address, such as `http://127.0.0.1:4173`. */
  readonly baseUrl: string;
  /** The host's sign-in password. Leave it out for a host that has none (it answers only on loopback). */
  readonly password?: string;
  /** Sends the requests; the global `fetch` when absent. */
  readonly fetch?: Fetcher;
  /** Gets what a connection listener throws, so one faulty listener can't break the reconnect loop. */
  readonly reportError: (error: unknown) => void;
  /** Waits between tries of a broken stream; a timer when absent. */
  readonly wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  /** The waits before each new try of a broken stream; the last repeats. Half a second doubling to ten when absent. */
  readonly retryDelaysMs?: readonly number[];
}

/**
 * The fields of a start the host's start routes don't take yet. Dropping them
 * would run something other than what the caller asked for, so a start that
 * sets one is refused here instead.
 */
const unsupportedStartFields = ["kind", "trigger", "harness", "cantTry", "version"] as const;

const defaultRetryDelaysMs: readonly number[] = [500, 1000, 2000, 5000, 10_000];

function timerWait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done);
  });
}

function refuseUnsupported(request: StartRunRequest | StartAgentRequest): void {
  const set = unsupportedStartFields.filter(
    (field) => (request as unknown as Record<string, unknown>)[field] !== undefined,
  );
  if (set.length > 0) {
    throw new RangeError(
      `A remote host doesn't take ${set.join(", ")} on a start yet, so this start isn't sent.`,
    );
  }
}

/** A run summary the host sent, checked to be an object with an id. */
async function readSummary(response: Response): Promise<RunSummary> {
  if (!response.ok) {
    throw await readHostError(response);
  }
  const body: unknown = await response.json();
  if (typeof (body as { id?: unknown } | null)?.id !== "string") {
    throw new RemoteHostError(response.status, "unexpected_response", "The host sent no run.");
  }
  return body as RunSummary;
}

/** The kind of a missing run target each host error code means. */
const missingTargetKinds = {
  hub_not_found: "hub",
  workflow_not_found: "workflow",
  agent_not_found: "agent",
} as const;

/** Turns the host's "no such hub, workflow or agent" into the port's `RunTargetNotFound`; any other error stays as it is. */
function asRunTargetNotFound(
  error: unknown,
  ids: Record<"hub" | "workflow" | "agent", string>,
): unknown {
  if (!(error instanceof RemoteHostError) || error.status !== 404) {
    return error;
  }
  const kind = missingTargetKinds[error.code as keyof typeof missingTargetKinds];
  return kind === undefined ? error : new RunTargetNotFound(kind, ids[kind], error.message);
}

/**
 * The {@link RunExecutor} port against a Halonic host over HTTP, such as
 * `halonic serve` or a Worker. It signs in with the host's password, forwards
 * starts, answers, cancels and chat turns, and follows a run through a stream
 * it resumes after a break. Uses `fetch` only, so it runs wherever `fetch` does.
 */
export function createRemoteExecutor(options: RemoteExecutorOptions): RunExecutor {
  const client = new HostClient(
    options.baseUrl,
    options.password,
    options.fetch ?? ((request) => fetch(request)),
  );
  const tracker = new ConnectionTracker(options.reportError);
  const streamOptions = {
    client,
    connection: tracker,
    wait: options.wait ?? timerWait,
    retryDelaysMs: options.retryDelaysMs ?? defaultRetryDelaysMs,
    report: options.reportError,
  };
  const runPath = (runId: string) => `/api/runs/${encodeURIComponent(runId)}`;

  return {
    id: "remote",

    async start(request: StartRunRequest): Promise<RunSummary> {
      refuseUnsupported(request);
      const { hubId, workflowId, input, runId } = request;
      try {
        return await readSummary(
          await client.call("/api/runs", {
            method: "POST",
            body: { hubId, workflowId, input, runId },
          }),
        );
      } catch (error) {
        throw asRunTargetNotFound(error, { hub: hubId, workflow: workflowId, agent: "" });
      }
    },

    async startAgent(request: StartAgentRequest): Promise<RunSummary> {
      refuseUnsupported(request);
      const { hubId, agentId, prompt, runId } = request;
      try {
        return await readSummary(
          await client.call("/api/agent-runs", {
            method: "POST",
            body: { hubId, agentId, prompt, runId },
          }),
        );
      } catch (error) {
        throw asRunTargetNotFound(error, { hub: hubId, workflow: "", agent: agentId });
      }
    },

    async send(
      runId: string,
      event: string,
      payload?: unknown,
      sendOptions?: SendOptions,
    ): Promise<RunSummary> {
      const body = { event, payload, callId: sendOptions?.callId };
      return readSummary(await client.call(`${runPath(runId)}/events`, { method: "POST", body }));
    },

    async cancel(runId: string): Promise<RunSummary> {
      return readSummary(
        await client.call(`${runPath(runId)}/cancel`, { method: "POST", body: {} }),
      );
    },

    subscribe(runId: string, afterSeq: number, listener: RunEventListener): RunSubscription {
      return followRun(streamOptions, runId, afterSeq, listener);
    },

    async chatTurn(request: ChatTurnRequest): Promise<ChatTurnResponse> {
      // The signal stays here: it aborts the request, and the host aborts the model call when the request closes.
      const { signal, ...body } = request;
      const call: HostCall = { method: "POST", body, ...(signal === undefined ? {} : { signal }) };
      const response = await client.call("/api/chat-turn", call);
      if (!response.ok) {
        throw await readHostError(response);
      }
      return (await response.json()) as ChatTurnResponse;
    },

    get connection(): EngineConnection {
      return tracker;
    },
  };
}
