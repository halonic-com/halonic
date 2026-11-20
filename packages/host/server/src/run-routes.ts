import type { RunStore } from "@halonicjs/ports";
import type { ErrorLog, ServerPorts, WorkspaceInfo } from "./api.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import { refuseUnlessTrusted } from "./trust-routes.ts";

/** Where the run routes start; `<runId>` and an optional action follow. */
export const runPathPrefix = "/api/runs/";

/** What the routes answer for a run: its summary, read from the run store. */
export interface RunRoutes {
  /** `GET /api/waiting-runs`: the summaries of the runs that wait for an answer, and their agents' names. */
  waiting(): Promise<Response>;
  /** `GET /api/runs/<runId>`: the run's summary. */
  summary(runId: string): Promise<Response>;
  /** `POST /api/runs/<runId>/events`: delivers an event to a waiting run. */
  send(request: Request, runId: string, body: Uint8Array): Promise<Response>;
  /** `POST /api/runs/<runId>/cancel`: cancels a run that hasn't ended. */
  cancel(request: Request, runId: string): Promise<Response>;
}

type RunRoutePorts = Pick<ServerPorts, "runs" | "runStore" | "trust" | "errorLog" | "workspace">;

/** The path of the list of runs that wait for an answer. */
export const waitingRunsPath = "/api/waiting-runs";

/** The most runs the waiting list answers; a person has no use for more on a phone. */
export const maxWaitingRuns = 100;

/** The longest run id the executor accepts, in UTF-8 bytes. */
const maxIdBytes = 256;

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Whether the body is declared as JSON. A form a web page sends across sites
 * can only be `application/x-www-form-urlencoded`, `multipart/form-data` or
 * `text/plain`, so a POST with another type is not one a person's page made
 * by accident, and a browser must ask the server first (with an `Origin`) to
 * send JSON.
 */
export function isJsonRequest(request: Request): boolean {
  const type = request.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  return type === "application/json";
}

/** A run id from the address: one decoded segment, not empty, at most 256 bytes. `null` when it is anything else. */
export function parseRunId(segment: string): string | null {
  let id: string;
  try {
    id = decodeURIComponent(segment);
  } catch {
    return null;
  }
  return id === "" || id.includes("/") || byteLength(id) > maxIdBytes ? null : id;
}

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

function isShortText(value: unknown): value is string {
  return typeof value === "string" && value !== "" && byteLength(value) <= maxIdBytes;
}

/** What a send names: a call, a wait step, or neither. `undefined` when it names none, `null` when it is malformed. */
function parseSendOptions(message: Record<string, unknown>): SendNames | null | undefined {
  const { callId, wait } = message;
  if (callId !== undefined && !isShortText(callId)) {
    return null;
  }
  if (wait !== undefined) {
    const { state, since } = (typeof wait === "object" && wait !== null ? wait : {}) as Record<
      string,
      unknown
    >;
    if (!isShortText(state) || !isShortText(since)) {
      return null;
    }
    return { ...(callId === undefined ? {} : { callId }), wait: { state, since } };
  }
  return callId === undefined ? undefined : { callId };
}

type SendNames = { callId?: string; wait?: { state: string; since: string } };

type RunSummary = Awaited<ReturnType<RunStore["list"]>>[number];

/**
 * By id, the names of the agents and subagents the runs' approvals name, as
 * the workspace's files say. An id without a name is left out, and so is
 * every id when the names can't be read: the list itself never fails for them.
 */
async function agentNamesOf(
  runs: readonly RunSummary[],
  workspace: WorkspaceInfo | undefined,
  errorLog: ErrorLog,
): Promise<Record<string, string>> {
  if (workspace?.agentNames === undefined) return {};
  const ids = new Set(
    runs.flatMap((run) =>
      run.approvals.flatMap((approval) =>
        approval.subagent === undefined ? [approval.agent] : [approval.agent, approval.subagent],
      ),
    ),
  );
  if (ids.size === 0) return {};
  let names: ReadonlyMap<string, string>;
  try {
    names = await workspace.agentNames();
  } catch (error) {
    errorLog.record(error);
    return {};
  }
  // A Map and `fromEntries`, so an id such as `constructor` or `__proto__` is only ever a key.
  return Object.fromEntries(
    [...ids].flatMap((id) => {
      const name = names.get(id);
      return name === undefined ? [] : [[id, name]];
    }),
  );
}

export function createRunRoutes({
  runs,
  runStore,
  trust,
  errorLog,
  workspace,
}: RunRoutePorts): RunRoutes {
  return {
    async waiting() {
      // The run store belongs to the workspace the server runs, so no other workspace's run can be in the list.
      const waiting = (await runStore.list({ status: "waiting" })).slice(0, maxWaitingRuns);
      return Response.json({
        runs: waiting,
        agents: await agentNamesOf(waiting, workspace, errorLog),
      });
    },

    async summary(runId) {
      const found = await runStore.get(runId);
      return found === null ? errorResponse(serverErrors.runNotFound) : Response.json(found);
    },

    async send(request, runId, body) {
      if (!isJsonRequest(request)) {
        return errorResponse(serverErrors.unsupportedMediaType);
      }
      const message = parseObject(body);
      const { event, payload } = message ?? {};
      const names = parseSendOptions(message ?? {});
      if (!isShortText(event) || names === null) {
        return errorResponse(serverErrors.badRequest);
      }
      if ((await runStore.get(runId)) === null) {
        return errorResponse(serverErrors.runNotFound);
      }
      // An answer such as "approve" lets a program run, so it needs trust just like a start.
      const refusal = await refuseUnlessTrusted(trust);
      if (refusal !== null) {
        return refusal;
      }
      try {
        const summary = await runs.send(runId, event, payload, names);
        return Response.json(summary);
      } catch (error) {
        // The port gives one error for "doesn't wait on this", "ended" and "wrong call", so all of them are a refusal.
        // The cause goes to the log, not to the caller.
        errorLog.record(error);
        return errorResponse(serverErrors.eventNotAccepted);
      }
    },

    async cancel(request, runId) {
      if (!isJsonRequest(request)) {
        return errorResponse(serverErrors.unsupportedMediaType);
      }
      if (runs.cancel === undefined) {
        return errorResponse(serverErrors.cancelNotSupported);
      }
      if ((await runStore.get(runId)) === null) {
        return errorResponse(serverErrors.runNotFound);
      }
      // No trust check: stopping a run starts nothing, and it must work in a workspace that changed.
      return Response.json(await runs.cancel(runId));
    },
  };
}
