import type { ActionCallRoute, ActionGuidedRoute, ActionSendRequest } from "@halonicjs/ports";

// Invented routes for the ActionSender contract, as the catalog's generated
// route list would hold them. Every name is `acme`-style.

const repo = { owner: "[A-Za-z0-9_.-]+", repo: "[A-Za-z0-9 _.-]+" };

export const approveRun: ActionCallRoute = {
  kind: "call",
  definition: "github.approve-run",
  version: 1,
  step: 2,
  service: "github",
  risk: "routine",
  method: "POST",
  path: "/repos/{owner}/{repo}/actions/runs/{runId}/approve",
  placeholders: { ...repo, runId: "[0-9]+" },
  body: [
    { name: "reason", kind: "string", pattern: ".{1,200}" },
    { name: "environmentIds", kind: "integer-list" },
  ],
  keep: ["id", "state", "details"],
};

export const deleteEnvironment: ActionCallRoute = {
  kind: "call",
  definition: "github.delete-environment",
  version: 1,
  step: 1,
  service: "github",
  risk: "irreversible",
  method: "DELETE",
  path: "/repos/{owner}/{repo}/environments/{environment}",
  placeholders: { ...repo, environment: "[A-Za-z0-9_-]+" },
  body: [],
  keep: [],
};

export const setWorkerSecret: ActionCallRoute = {
  kind: "call",
  definition: "cloudflare.set-worker-secret",
  version: 1,
  step: 1,
  service: "cloudflare",
  risk: "admin",
  method: "PUT",
  path: "/client/v4/accounts/{account}/workers/scripts/{script}/secrets",
  placeholders: { account: "[0-9a-f]{8,32}", script: "[a-z0-9-]+" },
  body: [
    { name: "name", kind: "string", pattern: "[A-Z][A-Z0-9_]*" },
    { name: "type", kind: "constant", value: "secret_text" },
    { name: "text", kind: "secret-input" },
  ],
  keep: ["name"],
};

export const addSecretPage: ActionGuidedRoute = {
  kind: "guided",
  definition: "github.add-secret",
  version: 1,
  step: 1,
  service: "github",
  risk: "admin",
  address: "https://github.com/{owner}/{repo}/settings/secrets/actions/new",
  placeholders: repo,
};

export const routes = [approveRun, deleteEnvironment, setWorkerSecret, addSecretPage];

export const runValues = { owner: "acme", repo: "app", runId: "123456" };
export const approveBody = { reason: "Release 1.2", environmentIds: [161088068] };

/** A request for a route's step with the given placeholders and body. */
export function stepOf(
  route: ActionCallRoute | ActionGuidedRoute,
  placeholders: Record<string, string>,
  body?: ActionSendRequest["body"],
): ActionSendRequest {
  const request: ActionSendRequest = {
    definition: route.definition,
    version: route.version,
    step: route.step,
    placeholders,
  };
  if (body !== undefined) request.body = body;
  return request;
}
