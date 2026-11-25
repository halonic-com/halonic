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
