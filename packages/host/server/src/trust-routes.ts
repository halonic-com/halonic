import { isAgentRunsNotAvailable, isRunTargetNotFound, type RunTargetKind } from "@halonicjs/ports";
import type { ServerPorts, TrustGate } from "./api.ts";
import { errorResponse, type ServerError, serverErrors } from "./errors.ts";

/** What a start answers for each kind of missing target. */
const notFoundErrors: Record<RunTargetKind, ServerError> = {
  hub: serverErrors.hubNotFound,
  workflow: serverErrors.workflowNotFound,
  agent: serverErrors.agentNotFound,
};

export interface TrustRoutes {
  /** `GET /api/trust`: what the trust check says now, for the Studio to show. Read-only. */
  show(): Promise<Response>;
  /** `POST /api/runs`: starts a workflow run, but only in a trusted workspace. */
  startWorkflow(body: Uint8Array): Promise<Response>;
  /** `POST /api/agent-runs`: starts a run of one agent, but only in a trusted workspace. */
  startAgent(body: Uint8Array): Promise<Response>;
}

type TrustRoutePorts = Pick<ServerPorts, "trust" | "runs">;

function parseObject(body: Uint8Array): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(body));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * What decides where and how an agent in a harness runs. The host decides all of it, from the
 * agent's file and the person's own choices on the computer (`server.harness-on-host`), so a start
 * that names one is refused, never ignored: a client that thinks it set them would be wrong.
 */
const hostOnlyFields = [
  "harness",
  "placement",
  "sandbox",
  "profile",
  "workingFolder",
  "allowedSites",
] as const;

function namesHostOnlyField(request: Record<string, unknown> | null): boolean {
  return hostOnlyFields.some((field) => request !== null && field in request);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The optional `runId` of a start: absent, or a non-empty string of at most
 * 256 UTF-8 bytes (the executor's limit), so a retry can't start a second run.
 */
function isRunId(value: unknown): value is string | undefined {
  return (
    value === undefined ||
    (typeof value === "string" && value !== "" && new TextEncoder().encode(value).length <= 256)
  );
}

/**
 * Asks the gate, every time, and answers the refusal to send when the state is
 * not `trusted`; `null` means go on. A gate that throws is an error that
 * reaches the caller, and nothing starts.
 */
export async function refuseUnlessTrusted(trust: TrustGate): Promise<Response | null> {
  const decision = await trust.check();
  return decision.state === "trusted" ? null : errorResponse(serverErrors.workspaceNotTrusted);
}

export function createTrustRoutes({ trust, runs }: TrustRoutePorts): TrustRoutes {
  /**
   * Asks the gate again for every start, never from memory, so a workspace
   * that changed after it was trusted starts nothing. A gate that fails
   * counts as no trust: the error reaches the caller as an internal error and
   * no run starts. A start that names a hub, workflow or agent that doesn't
   * exist answers 404; any other failure of the start stays an internal error.
   */
  async function whenTrusted(start: () => Promise<Response>): Promise<Response> {
    const refusal = await refuseUnlessTrusted(trust);
    if (refusal !== null) {
      return refusal;
    }
    try {
      return await start();
    } catch (error) {
      // A wrong name is the caller's mistake; the body doesn't say which hub, workflow or agent, or what exists.
      if (isRunTargetNotFound(error)) return errorResponse(notFoundErrors[error.kind]);
      // Not built yet, not broken: 501 instead of 500. TODO(engine step 4): remove when the agent loop lands.
      if (isAgentRunsNotAvailable(error)) return errorResponse(serverErrors.notImplemented);
      throw error;
    }
  }

  return {
    async show() {
      const { state, message } = await trust.check();
      return Response.json({ state, message });
    },

    async startWorkflow(body) {
      const request = parseObject(body);
      if (namesHostOnlyField(request)) return errorResponse(serverErrors.badRequest);
      const { hubId, workflowId } = request ?? {};
      const input = request?.["input"] ?? {};
      const runId = request?.["runId"];
      if (
        typeof hubId !== "string" ||
        typeof workflowId !== "string" ||
        !isObject(input) ||
        !isRunId(runId)
      ) {
        return errorResponse(serverErrors.badRequest);
      }
      return whenTrusted(async () =>
        Response.json(
          await runs.start(
            runId === undefined
              ? { hubId, workflowId, input }
              : { hubId, workflowId, input, runId },
          ),
        ),
      );
    },

    async startAgent(body) {
      const request = parseObject(body);
      if (namesHostOnlyField(request)) return errorResponse(serverErrors.badRequest);
      const { hubId, agentId, prompt } = request ?? {};
      const runId = request?.["runId"];
      if (
        typeof hubId !== "string" ||
        typeof agentId !== "string" ||
        typeof prompt !== "string" ||
        !isRunId(runId)
      ) {
        return errorResponse(serverErrors.badRequest);
      }
      return whenTrusted(async () =>
        Response.json(
          await runs.startAgent(
            runId === undefined ? { hubId, agentId, prompt } : { hubId, agentId, prompt, runId },
          ),
        ),
      );
    },
  };
}
