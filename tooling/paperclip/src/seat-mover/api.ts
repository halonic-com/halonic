/**
 * The seat mover's calls to Paperclip's own API (HAL-19354), with the board
 * key in the plugin's settings (`paperclipApiKey`). Reads: the AI
 * connections, the seat readings plugin's `seats` data, one agent. Writes: an
 * agent's `runtimeConfig` (only `aiConnection` changes), cancelling a parked
 * run that never started, and resolving the recovery hold that cancel leaves.
 */

/** The fetch the client uses: Node's own, since Paperclip's API is a private host. */
export type ApiFetch = (
  url: string,
  init: {
    readonly method: "GET" | "POST" | "PATCH";
    readonly headers: Record<string, string>;
    readonly body?: string;
    readonly signal?: AbortSignal;
  },
) => Promise<{ readonly ok: boolean; readonly status: number; json(): Promise<unknown> }>;

export interface SeatApiDeps {
  readonly fetch: ApiFetch;
  /** Scheme, host and port only. */
  readonly apiUrl: string;
  /** Reads the key at call time; it is never logged or kept. */
  readonly key: () => Promise<string>;
  readonly companyId: string;
  /** The key or id of the plugin whose `seats` data holds the readings. */
  readonly readingsPlugin: string;
}

/** An agent as `GET /api/agents/:id` returns it, with the fields a move needs. */
export interface AgentConfig {
  readonly id: string;
  readonly runtimeConfig: Record<string, unknown>;
}

export interface SeatApi {
  connections(): Promise<unknown>;
  seatReadings(): Promise<unknown>;
  agent(agentId: string): Promise<AgentConfig>;
  setRuntimeConfig(agentId: string, runtimeConfig: Record<string, unknown>): Promise<void>;
  cancelRun(runId: string): Promise<void>;
  /** The recovery action a cancelled run left on its task, if there is one. */
  recoveryActionFor(issueId: string, runId: string): Promise<string | undefined>;
  resolveRecovery(issueId: string, body: Record<string, unknown>): Promise<void>;
}

const timeoutMs = 15_000;

export function paperclipSeatApi(deps: SeatApiDeps): SeatApi {
  const call = async (
    method: "GET" | "POST" | "PATCH",
    path: string,
    body?: unknown,
  ): Promise<unknown> => {
    const key = await deps.key();
    const response = await deps.fetch(`${deps.apiUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${key}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Paperclip answered ${response.status} to ${method} ${path.split("?")[0]}`);
    }
    return await response.json();
  };
  const company = encodeURIComponent(deps.companyId);
  return {
    connections: () => call("GET", `/api/companies/${company}/ai-connections`),
    seatReadings: () =>
      call("POST", `/api/plugins/${encodeURIComponent(deps.readingsPlugin)}/data/seats`, {
        companyId: deps.companyId,
        params: {},
      }),
    async agent(agentId) {
      const body = (await call("GET", `/api/agents/${encodeURIComponent(agentId)}`)) as Record<
        string,
        unknown
      > | null;
      const runtimeConfig = body?.["runtimeConfig"];
      if (body === null || typeof runtimeConfig !== "object" || runtimeConfig === null) {
        throw new Error(`Agent ${agentId} came back without its runtimeConfig`);
      }
      return { id: agentId, runtimeConfig: runtimeConfig as Record<string, unknown> };
    },
    async setRuntimeConfig(agentId, runtimeConfig) {
      await call("PATCH", `/api/agents/${encodeURIComponent(agentId)}`, { runtimeConfig });
    },
    async cancelRun(runId) {
      await call("POST", `/api/heartbeat-runs/${encodeURIComponent(runId)}/cancel`, {});
    },
    async recoveryActionFor(issueId, runId) {
      const query = `inspectSourceRunId=${encodeURIComponent(runId)}`;
      const body = (await call(
        "GET",
        `/api/issues/${encodeURIComponent(issueId)}/recovery-actions?${query}`,
      )) as { active?: { id?: unknown } | null } | null;
      const id = body?.active?.id;
      return typeof id === "string" ? id : undefined;
    },
    async resolveRecovery(issueId, body) {
      await call(
        "POST",
        `/api/issues/${encodeURIComponent(issueId)}/recovery-actions/resolve`,
        body,
      );
    },
  };
}
