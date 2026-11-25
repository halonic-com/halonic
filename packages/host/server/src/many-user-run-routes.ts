import type { RunSummary } from "@halonicjs/events";
import type { AccountMenuParts } from "./account-menu-route.ts";
import type { ServerPorts } from "./api.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import type { RunOwnership, RunOwnershipStore, ScopedRunPorts } from "./many-users-api.ts";
import type { Principal } from "./principal.ts";
import type { RouteParams } from "./route-table.ts";
import { actionAccess, ownerOfUnrecordedRun, type RunAction, readAccess } from "./run-access.ts";
import { type RunEndpointRequest, serveRunEndpoint } from "./run-endpoint.ts";
import { isJsonRequest, maxWaitingRuns, type RunRoutes } from "./run-routes.ts";
import { isRunId, type TrustRoutes } from "./trust-routes.ts";

/** What a signed-in request works with: its principal and the routes over that scope's runs. */
export interface ScopedRoutes {
  readonly principal: Principal;
  readonly runRoutes: RunRoutes;
  readonly trustRoutes: TrustRoutes;
  readonly ports: ScopedRunPorts & { readonly ownership: RunOwnershipStore } & Pick<
      ServerPorts,
      "errorLog"
    >;
  /** The account menu's parts, or `null` without Cloud sign-in or a profile in the session. */
  readonly accountMenu: AccountMenuParts | null;
}

/** Answers a request that has a principal. */
export type SignedInHandler = (
  request: Request,
  body: Uint8Array,
  scoped: ScopedRoutes,
  params: RouteParams,
) => Promise<Response>;

/**
 * The run's owner in the principal's scope, or `null` when the scope has no such run. A run from
 * before owners were recorded has none stored, and belongs to whoever its scope says.
 */
async function ownershipOf(
  { principal, ports }: ScopedRoutes,
  runId: string,
): Promise<RunOwnership | null> {
  const stored = await ports.ownership.get(runId);
  if (stored !== null) {
    return stored;
  }
  return (await ports.runStore.get(runId)) === null ? null : ownerOfUnrecordedRun(principal);
}

/**
 * What an organisation's owner or admin sees of someone else's private run: who started it,
 * when, which workflow, how it went and what it cost. Never its input, events or output.
 */
function metadataOf(summary: RunSummary, ownership: RunOwnership) {
  const { id, hubId, workflowId, kind, status, startedAt, endedAt, cost, reason } = summary;
  const { startedBy, visibility } = ownership;
  return {
    id,
    hubId,
    workflowId,
    kind,
    status,
    startedAt,
    endedAt,
    cost,
    reason,
    startedBy,
    visibility,
  };
}

/** The answer to reading a run: its summary, its metadata row, or the answer for no such run. */
async function readAnswer(scoped: ScopedRoutes, runId: string): Promise<Response> {
  const ownership = await ownershipOf(scoped, runId);
  const access = readAccess(scoped.principal, ownership);
  if (access === "content") {
    return scoped.runRoutes.summary(runId);
  }
  const summary = await scoped.ports.runStore.get(runId);
  if (access === "not-found" || summary === null || ownership === null) {
    return errorResponse(serverErrors.runNotFound);
  }
  return Response.json(metadataOf(summary, ownership));
}

/** `GET /api/runs/<runId>`: the summary, or only the metadata for an owner or admin. */
export const summaryHandler: SignedInHandler = async (_request, _body, scoped, { runId }) =>
  runId === undefined ? errorResponse(serverErrors.notFound) : readAnswer(scoped, runId);

/** `GET /api/runs/<runId>/events`: the run's events, for whoever may read its content. */
export const eventsHandler: SignedInHandler = async (request, body, scoped, { runId }) => {
  if (runId === undefined) {
    return errorResponse(serverErrors.notFound);
  }
  const access = readAccess(scoped.principal, await ownershipOf(scoped, runId));
  if (access === "not-found") {
    return errorResponse(serverErrors.runNotFound);
  }
  if (access === "metadata") {
    return errorResponse(serverErrors.runActionForbidden);
  }
  return serveRunEndpoint({ runId, endpoint: "GET events" }, request, body, scoped);
};

/** An action on the run named by the path, for whoever may take it. */
function actionHandler(
  action: RunAction,
  endpoint: RunEndpointRequest["endpoint"],
): SignedInHandler {
  return async (request, body, scoped, { runId }) => {
    if (runId === undefined) {
      return errorResponse(serverErrors.notFound);
    }
    const access = actionAccess(scoped.principal, await ownershipOf(scoped, runId), action);
    if (access === "not-found") {
      return errorResponse(serverErrors.runNotFound);
    }
    if (access === "forbidden") {
      return errorResponse(serverErrors.runActionForbidden);
    }
    return serveRunEndpoint({ runId, endpoint }, request, body, scoped);
  };
}

/** `POST /api/runs/<runId>/events`: an answer or a continue, only from whoever started the run. */
export const sendHandler = actionHandler("send", "POST events");

/** `POST /api/runs/<runId>/cancel`: from whoever started the run, or an organisation's owner or admin. */
export const cancelHandler = actionHandler("cancel", "POST cancel");

/** `GET /api/waiting-runs`: only the runs the principal started that wait for an answer. */
export const waitingHandler: SignedInHandler = async (_request, _body, scoped) => {
  const waiting = await scoped.ports.runStore.list({ status: "waiting" });
  const own: RunSummary[] = [];
  for (const run of waiting) {
    if (own.length === maxWaitingRuns) break;
    const ownership = await ownershipOf(scoped, run.id);
    if (ownership?.startedBy === scoped.principal.actor) own.push(run);
  }
  return Response.json({ runs: own, agents: await scoped.runRoutes.agentNames(own) });
};

/** The start's body as an object with a run id: the caller's, or a new one. `null` when it isn't JSON. */
function withRunId(body: Uint8Array): { runId: unknown; body: Uint8Array } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return null;
  }
  const fields = parsed as Record<string, unknown>;
  if (fields["runId"] !== undefined) {
    return { runId: fields["runId"], body };
  }
  const runId = `run_${crypto.randomUUID()}`;
  return { runId, body: new TextEncoder().encode(JSON.stringify({ ...fields, runId })) };
}

/**
 * Starts a run in the principal's scope, after claiming its id for the principal. A start with
 * an id someone else already holds starts nothing and answers what reading that run answers, so
 * it can't reveal a run the principal may not read. A cross-site form can only send a non-JSON
 * type, so it never starts one.
 */
export function startHandler(isWorkflow: boolean): SignedInHandler {
  return async (request, body, scoped) => {
    if (!isJsonRequest(request)) {
      return errorResponse(serverErrors.unsupportedMediaType);
    }
    const start = withRunId(body);
    // The id is checked before it is claimed, so a malformed one never gets an owner's row.
    if (start === null || start.runId === undefined || !isRunId(start.runId)) {
      return errorResponse(serverErrors.badRequest);
    }
    const { principal, ports } = scoped;
    const owner: RunOwnership = {
      startedBy: principal.actor,
      visibility: ports.defaultRunVisibility ?? "private",
    };
    // A run from before owners were recorded can't be claimed by whoever names its id first.
    const unrecorded =
      (await ports.ownership.get(start.runId)) === null &&
      (await ports.runStore.get(start.runId)) !== null;
    const stored = unrecorded ? null : await ports.ownership.claim(start.runId, owner);
    if (stored?.startedBy !== principal.actor) {
      return readAnswer(scoped, start.runId);
    }
    const { trustRoutes } = scoped;
    return isWorkflow ? trustRoutes.startWorkflow(start.body) : trustRoutes.startAgent(start.body);
  };
}
