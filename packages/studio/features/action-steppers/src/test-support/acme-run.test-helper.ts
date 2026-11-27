/**
 * An invented catalog for the stepper run's tests, with the routes its generated list would hold:
 * the `acme` organisation on GitHub, never a real workspace.
 */
import {
  type RequesterPolicy,
  type StepperCatalog,
  type StepperDefinition,
  strictParameters,
} from "@halonicjs/action-steppers";
import type { ActionRoute, InboxActionRequest } from "@halonicjs/ports";

type Values = Record<string, string | number>;

const owner = { kind: "text", pattern: /^[A-Za-z0-9-]{1,39}$/ } as const;
const repo = { kind: "text", pattern: /^[A-Za-z0-9._-]{1,100}$/ } as const;
const name = { kind: "text", pattern: /^[A-Z][A-Z0-9_]{0,63}$/ } as const;
const repository = (parameters: Values) => [
  { service: "github", kind: "repository", name: `${parameters["owner"]}/${parameters["repo"]}` },
];
const manual = { url: "https://github.com/{owner}/{repo}/settings", instructions: ["Do it here."] };

/** Sets an Actions variable through the API, then opens its page to look at it. */
const setVariable: StepperDefinition<Values> = {
  id: "acme.set-variable",
  version: 1,
  service: "github",
  title: "Set a repository variable",
  summary: "Sets one Actions variable.",
  risk: "routine",
  parameters: strictParameters({
    owner,
    repo,
    name,
    value: { kind: "text", pattern: /^[a-z]{1,20}$/ },
  }),
  steps: [
    { kind: "script", ref: "acme/set-variable", manual },
    {
      kind: "guided",
      address: "https://github.com/{owner}/{repo}/settings/variables/actions",
      instructions: ["Check that {name} is there."],
      checkedOn: "2026-11-24",
      result: { label: "Variable name", pattern: "^[A-Z][A-Z0-9_]{0,63}$" },
    },
  ],
  targets: repository,
  preview: (parameters) => [`Sets ${parameters["name"]}.`, `Opens the variables page.`],
};

/** Sets an Actions secret whose value the user types in the shell's own dialog. */
const setSecret: StepperDefinition<Values> = {
  id: "acme.set-secret",
  version: 1,
  service: "github",
  title: "Set a repository secret",
  summary: "Sets one Actions secret.",
  risk: "admin",
  parameters: strictParameters({ owner, repo, name }),
  steps: [{ kind: "script", ref: "acme/set-secret", manual }],
  targets: repository,
  preview: (parameters) => [`Sets the secret ${parameters["name"]}.`],
};

const runnerPath = "/repos/{owner}/{repo}/actions/runners/{runner}";

/** Removes a self-hosted runner, only once a check shows it is offline. */
const removeRunner: StepperDefinition<Values> = {
  id: "acme.remove-runner",
  version: 1,
  service: "github",
  title: "Remove a runner",
  summary: "Removes one self-hosted runner.",
  risk: "admin",
  parameters: strictParameters({ owner, repo, runner: { kind: "integer", min: 1, max: 99999 } }),
  steps: [
    {
      kind: "check",
      path: runnerPath,
      keep: ["status", "name"],
      requires: [
        { name: "status", equals: "offline", reason: "The runner is still online. Stop it first." },
      ],
      manual,
    },
    { kind: "call", method: "DELETE", path: runnerPath, body: [], keep: [], manual },
  ],
  targets: repository,
  preview: () => ["Reads the runner.", "Removes the runner."],
};

const repoPatterns = { owner: "^[A-Za-z0-9-]{1,39}$", repo: "^[A-Za-z0-9._-]{1,100}$" };
const base = { service: "github", version: 1 } as const;

/** The routes the shell would compile for the definitions. */
export const acmeRunRoutes: readonly ActionRoute[] = [
  {
    ...base,
    kind: "call",
    definition: "acme.set-variable",
    step: 1,
    risk: "routine",
    method: "PATCH",
    path: "/repos/{owner}/{repo}/actions/variables/{name}",
    placeholders: { ...repoPatterns, name: "^[A-Z][A-Z0-9_]{0,63}$" },
    body: [
      { name: "value", kind: "string", pattern: "^[a-z]{1,20}$" },
      { name: "visibility", kind: "constant", value: "all" },
    ],
    keep: ["name"],
  },
  {
    ...base,
    kind: "guided",
    definition: "acme.set-variable",
    step: 2,
    risk: "routine",
    address: "https://github.com/{owner}/{repo}/settings/variables/actions",
    placeholders: repoPatterns,
  },
  {
    ...base,
    kind: "call",
    definition: "acme.set-secret",
    step: 1,
    risk: "admin",
    method: "PUT",
    path: "/repos/{owner}/{repo}/actions/secrets/{name}",
    placeholders: { ...repoPatterns, name: "^[A-Z][A-Z0-9_]{0,63}$" },
    body: [{ name: "value", kind: "secret-input" }],
    keep: [],
  },
  {
    ...base,
    kind: "call",
    definition: "acme.remove-runner",
    step: 1,
    risk: "routine",
    method: "GET",
    path: runnerPath,
    placeholders: { ...repoPatterns, runner: "^[0-9]{1,16}$" },
    body: [],
    keep: ["status", "name"],
  },
  {
    ...base,
    kind: "call",
    definition: "acme.remove-runner",
    step: 2,
    risk: "admin",
    method: "DELETE",
    path: runnerPath,
    placeholders: { ...repoPatterns, runner: "^[0-9]{1,16}$" },
    body: [],
    keep: [],
  },
];

const definitions = [setVariable, setSecret, removeRunner];

/** The invented catalog, with its routes. */
export const acmeRunCatalog: StepperCatalog = {
  definition: (id, version) =>
    definitions.find((each) => each.id === id && each.version === version),
  stepType: () => undefined,
  browserOrigins: [],
  route: (id, version, step) =>
    acmeRunRoutes.find(
      (route) => route.definition === id && route.version === version && route.step === step,
    ),
};

/** Lets "Paperclip · Acme" ask for admin steppers. */
export const allowsAcme: RequesterPolicy = {
  allowed: [{ source: { kind: "paperclip", id: "paperclip:acme" } }],
};

/** Set `ACME_MODE` to `on` on `acme/app`. */
export const variableRequest: InboxActionRequest = {
  definition: "acme.set-variable",
  version: 1,
  parameters: { owner: "acme", repo: "app", name: "ACME_MODE", value: "on" },
  expires: "2026-11-25T12:00:00.000Z",
};

/** Set the secret `ACME_TOKEN` on `acme/app`. */
export const secretRequest: InboxActionRequest = {
  definition: "acme.set-secret",
  version: 1,
  parameters: { owner: "acme", repo: "app", name: "ACME_TOKEN" },
  expires: "2026-11-25T12:00:00.000Z",
};

/** Remove runner 7 of `acme/app`, as the requester saw it named `acme-build-1`. */
export const runnerRequest: InboxActionRequest = {
  definition: "acme.remove-runner",
  version: 1,
  parameters: { owner: "acme", repo: "app", runner: 7 },
  expect: { name: "acme-build-1" },
  expires: "2026-11-25T12:00:00.000Z",
};
