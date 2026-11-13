import type { ServerPorts } from "./api.ts";
import { errorResponse, serverErrors } from "./errors.ts";

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

export function createTrustRoutes({ trust, runs }: TrustRoutePorts): TrustRoutes {
  /**
   * Asks the gate again for every start, never from memory, so a workspace
   * that changed after it was trusted starts nothing. A gate that fails
   * counts as no trust: the error reaches the caller as an internal error and
   * no run starts.
   */
  async function whenTrusted(start: () => Promise<Response>): Promise<Response> {
    const decision = await trust.check();
    if (decision.state !== "trusted") {
      return errorResponse(serverErrors.workspaceNotTrusted);
    }
    return start();
  }

  return {
    async show() {
      const { state, message } = await trust.check();
      return Response.json({ state, message });
    },

    async startWorkflow(body) {
      const request = parseObject(body);
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
