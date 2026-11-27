/**
 * An invented action catalog for the Inbox's tests: one admin definition on the `acme`
 * organisation's GitHub repositories, never a real workspace.
 */
import {
  type StepperCatalog,
  type StepperDefinition,
  strictParameters,
} from "@halonicjs/action-steppers";
import type { InboxActionRequest } from "@halonicjs/ports";

type Values = Record<string, string | number>;

const approveDeployment: StepperDefinition<Values> = {
  id: "github.approve-deployment",
  version: 1,
  service: "github",
  title: "Approve a deployment",
  summary: "Approves one waiting deployment.",
  risk: "admin",
  parameters: strictParameters({
    owner: { kind: "text", pattern: /^[A-Za-z0-9-]{1,39}$/ },
    repo: { kind: "text", pattern: /^[A-Za-z0-9._-]{1,100}$/ },
    environment: { kind: "choice", options: ["release", "staging"] },
  }),
  steps: [
    {
      kind: "script",
      ref: "github/approve-deployment",
      manual: {
        url: "https://github.com/{owner}/{repo}/actions",
        instructions: [
          "Open the waiting run, click Review deployments, tick {environment} and approve.",
        ],
      },
    },
  ],
  targets: (parameters) => [
    { service: "github", kind: "repository", name: `${parameters["owner"]}/${parameters["repo"]}` },
  ],
  preview: (parameters) => [
    `Approves the deployment of ${parameters["owner"]}/${parameters["repo"]} to ${parameters["environment"]}.`,
  ],
};

/** The invented catalog: the one definition, no step types and no browser pages. */
export const acmeActionCatalog: StepperCatalog = {
  definition: (id, version) =>
    id === approveDeployment.id && version === approveDeployment.version
      ? approveDeployment
      : undefined,
  stepType: () => undefined,
  browserOrigins: [],
  route: () => undefined,
};

/** Approve the deployment of `acme/app` to `release`, expiring 25 Nov 2026 at noon UTC. */
export const approveAcmeApp: InboxActionRequest = {
  definition: "github.approve-deployment",
  version: 1,
  parameters: { owner: "acme", repo: "app", environment: "release" },
  expires: "2026-11-25T12:00:00.000Z",
};

const signInPhases = ["start", "approve", "keep", "test"] as const;

/** Connects Studio to the invented `acme` Paperclip, in the four parts of a sign-in. */
const connectAndTest: StepperDefinition<Values> = {
  id: "paperclip.connect-and-test",
  version: 1,
  service: "paperclip",
  title: "Connect Studio to Paperclip and test the sign-in",
  summary: "Signs in to Paperclip.",
  risk: "admin",
  parameters: strictParameters({
    host: { kind: "text", pattern: /^[a-z0-9.-]{1,253}$/ },
    connection: { kind: "text", pattern: /^[a-z]{1,20}$/ },
    mode: { kind: "choice", options: ["connect", "test"] },
  }),
  steps: signInPhases.map((phase) => ({
    kind: "sign-in",
    service: "paperclip",
    phase,
    manual: { url: "https://{host}/", instructions: ["Follow Studio."] },
  })),
  targets: (parameters) => [
    { service: "paperclip", kind: "Paperclip", name: String(parameters["host"]) },
  ],
  preview: () => signInPhases.map((phase) => `The ${phase} part.`),
};

/** A catalog with only the sign-in stepper. */
export const acmeSignInCatalog: StepperCatalog = {
  definition: (id, version) =>
    id === connectAndTest.id && version === connectAndTest.version ? connectAndTest : undefined,
  stepType: () => undefined,
  browserOrigins: [],
  route: () => undefined,
};

/** Test a sign-in to the `acme` connection on `paperclip.acme.example`. */
export const testAcmeSignIn: InboxActionRequest = {
  definition: "paperclip.connect-and-test",
  version: 1,
  parameters: { host: "paperclip.acme.example", connection: "acme", mode: "test" },
  expires: "2026-11-25T12:00:00.000Z",
};
