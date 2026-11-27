/**
 * An invented deployment approval for the stepper run's tests, shaped like the one HAL-17522
 * plans: a check on the workflow run, a check on the environment, then the approval itself. It
 * uses the `acme` organisation on GitHub, never a real workspace.
 */
import {
  routesOf,
  type StepperCatalog,
  type StepperDefinition,
  strictParameters,
} from "@halonicjs/action-steppers";
import type { InboxActionRequest } from "@halonicjs/ports";

type Values = Record<string, string | number>;

const runPath = "/repos/{owner}/{repo}/actions/runs/{run_id}";
const manual = { url: "https://github.com/{owner}/{repo}/actions", instructions: ["Do it here."] };

/** The reasons the definition stops with, as the tests compare them. */
export const notWaiting = "The run isn't waiting for an approval anymore.";
export const otherEnvironment = "This isn't the environment the request names.";

/** Approves one waiting deployment of a workflow run, only to the environment the request names. */
export const approveDeployment: StepperDefinition<Values> = {
  id: "acme.approve-deployment",
  version: 1,
  service: "github",
  title: "Approve a deployment",
  summary: "Approves one waiting deployment.",
  risk: "admin",
  parameters: strictParameters({
    owner: { kind: "text", pattern: /^[A-Za-z0-9-]{1,39}$/ },
    repo: { kind: "text", pattern: /^[A-Za-z0-9._-]{1,100}$/ },
    run_id: { kind: "integer", min: 1, max: 99999999 },
    environment: { kind: "text", pattern: /^[a-z]{1,20}$/ },
    environment_id: { kind: "integer", min: 1, max: 99999999 },
  }),
  steps: [
    {
      kind: "check",
      path: runPath,
      keep: ["status", "head_sha"],
      requires: [{ name: "status", equals: "waiting", reason: notWaiting }],
      requiredExpect: ["head_sha"],
      manual,
    },
    {
      kind: "check",
      path: "/repos/{owner}/{repo}/environments/{environment}",
      keep: ["id", "name"],
      requires: [{ name: "id", equalsParameter: "environment_id", reason: otherEnvironment }],
      manual,
    },
    {
      kind: "call",
      method: "POST",
      path: `${runPath}/pending_deployments`,
      body: [{ name: "environment_ids", kind: "parameter-list", parameter: "environment_id" }],
      keep: [],
      manual,
    },
  ],
  targets: (parameters) => [
    { service: "github", kind: "repository", name: `${parameters["owner"]}/${parameters["repo"]}` },
  ],
  preview: () => ["Reads the run.", "Reads the environment.", "Approves the deployment."],
};

/** Approve run 42 of `acme/app` to `release`, environment 161, as the requester saw it at `abc123`. */
export const deploymentRequest: InboxActionRequest = {
  definition: "acme.approve-deployment",
  version: 1,
  parameters: {
    owner: "acme",
    repo: "app",
    run_id: 42,
    environment: "release",
    environment_id: 161,
  },
  expect: { head_sha: "abc123" },
  expires: "2026-11-25T12:00:00.000Z",
};

/** The routes the shell would compile for the definition. */
export const deploymentRoutes = routesOf(approveDeployment);

/** A catalog with only the deployment approval and its routes. */
export const deploymentCatalog: StepperCatalog = {
  definition: (id, version) =>
    id === approveDeployment.id && version === approveDeployment.version
      ? approveDeployment
      : undefined,
  stepType: () => undefined,
  browserOrigins: [],
  route: (id, version, step) =>
    deploymentRoutes.find(
      (route) => route.definition === id && route.version === version && route.step === step,
    ),
};
