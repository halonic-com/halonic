/**
 * An invented catalog and action items for the review's tests: the `acme` organisation on GitHub,
 * never a real workspace. The definitions are shaped like `core/action-catalog`'s will be.
 */
import {
  type StepperCatalog,
  type StepperDefinition,
  strictParameters,
} from "@halonicjs/action-steppers";
import type { InboxActionRequest, MessagingSource } from "@halonicjs/ports";
import type { ActionItem } from "../review/action-item-review.ts";

type Values = Record<string, string | number>;

const owner = { kind: "text", pattern: /^[A-Za-z0-9-]{1,39}$/ } as const;
const repo = { kind: "text", pattern: /^[A-Za-z0-9._-]{1,100}$/ } as const;

const repository = (parameters: Values) => [
  { service: "github", kind: "repository", name: `${parameters["owner"]}/${parameters["repo"]}` },
];

/** An admin API step: approves a waiting deployment. Its call comes from a script. */
const approveDeployment: StepperDefinition<Values> = {
  id: "github.approve-deployment",
  version: 1,
  service: "github",
  title: "Approve a deployment",
  summary: "Approves one waiting deployment.",
  risk: "admin",
  parameters: strictParameters({
    owner,
    repo,
    environment: { kind: "choice", options: ["release", "staging"] },
    run: { kind: "integer", min: 1, max: 99_999_999_999 },
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
  targets: repository,
  preview: (parameters) => [
    `Approves the deployment of ${parameters["owner"]}/${parameters["repo"]} to ${parameters["environment"]} for run ${parameters["run"]}.`,
  ],
};

/** A routine guided step, then the value typed into the secure field. */
const setVariable: StepperDefinition<Values> = {
  id: "github.set-variable",
  version: 1,
  service: "github",
  title: "Set a repository variable",
  summary: "Sets one Actions variable.",
  risk: "routine",
  parameters: strictParameters({
    owner,
    repo,
    name: { kind: "text", pattern: /^[A-Z][A-Z0-9_]{0,63}$/ },
  }),
  steps: [
    {
      kind: "guided",
      address: "https://github.com/{owner}/{repo}/settings/variables/actions/new",
      instructions: ["Type {name} as the name and the value, then click Add variable."],
      checkedOn: "2026-11-24",
    },
    { kind: "input", name: "value", label: "Variable value", secret: true },
  ],
  targets: repository,
  preview: (parameters) => [
    `Opens the new variable page of ${parameters["owner"]}/${parameters["repo"]}.`,
    `Sets ${parameters["name"]} to the value you type.`,
  ],
};

const definitions = [approveDeployment, setVariable];

/** The invented catalog: two whole definitions and no browser pages. */
export const acmeCatalog: StepperCatalog = {
  definition: (id, version) =>
    definitions.find((each) => each.id === id && each.version === version),
  stepType: () => undefined,
  browserOrigins: [],
  route: () => undefined,
};

/** The invented catalog with its guided step's `checkedOn` replaced, such as `from docs`. */
export function catalogCheckedOn(checkedOn: string): StepperCatalog {
  const changed: StepperDefinition<Values> = {
    ...setVariable,
    steps: setVariable.steps.map((step) =>
      step.kind === "guided" ? { ...step, checkedOn } : step,
    ),
  };
  return {
    ...acmeCatalog,
    definition: (id, version) =>
      id === changed.id && version === changed.version
        ? changed
        : acmeCatalog.definition(id, version),
  };
}

/** Set `DEPLOY_ENV` on `acme/app`: one guided step, then the secret value. */
export const setVariableRequest: InboxActionRequest = {
  definition: "github.set-variable",
  version: 1,
  parameters: { owner: "acme", repo: "app", name: "DEPLOY_ENV" },
  expires: "2026-11-25T12:00:00.000Z",
};

/** The source "Paperclip · Acme", as its provider attests it. */
export const acmeSource: MessagingSource = {
  id: "paperclip:acme",
  provider: "paperclip",
  label: "Paperclip · Acme",
  state: { kind: "online", asOf: "2026-11-24T10:00:00.000Z" },
};

/** Approve the deployment of `acme/app` to `release`, expiring 25 Nov 2026 at noon UTC. */
export const approveRequest: InboxActionRequest = {
  definition: "github.approve-deployment",
  version: 1,
  parameters: { owner: "acme", repo: "app", environment: "release", run: 123456 },
  expires: "2026-11-25T12:00:00.000Z",
};

/** An open action item from Chief on `source`, asking for `action`. */
export function actionItem(
  action: InboxActionRequest = approveRequest,
  source: MessagingSource = acmeSource,
): ActionItem {
  return {
    id: "item-1",
    source: source.id,
    from: { kind: "agent", agent: "agent-chief", name: "Chief" },
    question: "The release is ready. [Details](https://acme.example)",
    options: [],
    action,
    attachments: [],
    createdAt: "2026-11-24T10:00:00.000Z",
    state: { kind: "open" },
  };
}
