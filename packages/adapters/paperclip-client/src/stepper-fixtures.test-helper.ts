import {
  type StepperCatalog,
  type StepperDefinition,
  strictParameters,
} from "@halonicjs/action-steppers";
import { acmeData, agentBo, company, me, plainTask, testKey } from "./acme-data.test-helper.ts";
import { PaperclipMessaging } from "./client.ts";
import { type FakePaperclip, type Network, testNow } from "./fake-paperclip.test-helper.ts";

// Recorded shapes of Paperclip's document and card answers, with an invented `acme` company.

export const stepperCard = "f0000000-0000-4000-8000-000000000009";
export const pinned = "d0000000-0000-4000-8000-000000000001";
export const newer = "d0000000-0000-4000-8000-000000000002";
export const resultRevision = "d0000000-0000-4000-8000-000000000003";

const repository = {
  owner: { kind: "text", pattern: /^[a-z-]{1,39}$/ },
  repo: { kind: "text", pattern: /^[a-z-]{1,100}$/ },
  name: { kind: "text", pattern: /^[A-Z_]{1,64}$/ },
} as const;

type Parameters = Record<string, string | number>;
const targets = (parameters: Parameters) => [
  { service: "github", kind: "repository", name: `${parameters["owner"]}/${parameters["repo"]}` },
];

const setVariable: StepperDefinition<Parameters> = {
  id: "github.set-variable",
  version: 1,
  service: "github",
  title: "Set a repository variable",
  summary: "Sets one Actions variable.",
  risk: "routine",
  parameters: strictParameters(repository),
  steps: [
    {
      kind: "guided",
      address: "https://github.com/{owner}/{repo}/settings/variables/actions/new",
      instructions: ["Type {name} and the value, then click Add variable."],
      checkedOn: "2026-11-24",
    },
  ],
  targets,
  preview: (parameters) => [`Sets ${parameters["name"]}.`],
};

const setSecret: StepperDefinition<Parameters> = {
  ...setVariable,
  id: "github.set-secret",
  title: "Set a repository secret",
  risk: "admin",
  steps: [{ kind: "input", name: "value", label: "The secret's value", secret: true }],
};

/** An invented catalog: two GitHub step types, one taking a secret, and the variables pages. */
export const stepperCatalog: StepperCatalog = {
  definition: () => undefined,
  stepType: (id, version) =>
    [setVariable, setSecret].find((type) => type.id === id && type.version === version),
  browserOrigins: [
    {
      service: "github",
      host: "github.com",
      pathPrefixes: ["/{owner}/{repo}/settings/variables/"],
    },
  ],  route: () => undefined,
};

const parameters = { owner: "acme", repo: "app" };

/** A request in three blocks: a variable, a secret, and a page to check them on. */
export const requestDocument = {
  format: "halonic.stepper-request/1",
  title: "Set up the deploy",
  reason: "The release job needs a region and a key.",
  blocks: [
    { kind: "step", ref: "github.set-variable@1", parameters: { ...parameters, name: "REGION" } },
    { kind: "step", ref: "github.set-secret@1", parameters: { ...parameters, name: "DEPLOY_KEY" } },
    {
      kind: "browser",
      url: "https://github.com/acme/app/settings/variables/actions",
      instructions: ["Check that REGION is listed."],
    },
  ],
};

/** The card Bo made, pinned to revision `pinned` of the plain task's `stepper-request`. */
export function stepperCardRecord(revisionId = pinned) {
  return {
    id: stepperCard,
    kind: "request_confirmation",
    status: "pending",
    createdByAgentId: agentBo,
    payload: {
      version: 1,
      prompt: "The release needs the deploy region and key.",
      detailsMarkdown: "1. Open the variables page.",
      target: { type: "issue_document", issueId: plainTask, key: "stepper-request", revisionId },
    },
    createdAt: "2026-11-24T10:06:00.000Z",
  };
}

/** Paperclip's answer to one revision of the request document, as recorded. */
export function revisionAnswer(body: string, latest = pinned) {
  return {
    id: pinned,
    documentId: "e0000000-0000-4000-8000-000000000001",
    issueId: plainTask,
    key: "stepper-request",
    revisionNumber: 1,
    title: "Stepper request",
    format: "markdown",
    body,
    createdByAgentId: agentBo,
    createdAt: "2026-11-24T10:05:00.000Z",
    latestRevisionId: latest,
    latestRevisionNumber: latest === pinned ? 1 : 2,
    isLatest: latest === pinned,
  };
}

const documents = `/api/issues/${plainTask}/documents`;

/** The routes of the request document and the result, both on the plain task. */
export const stepperPaths = {
  revision: `${documents}/stepper-request/revisions/${pinned}`,
  latest: `${documents}/stepper-request`,
  result: `${documents}/stepper-result`,
};

/** Serves Acme with the stepper card on the plain task and `body` as the pinned revision. */
export function serveStepper(
  paperclip: FakePaperclip,
  options: { body?: string; latest?: string } = {},
): FakePaperclip {
  const data = acmeData();
  const latest = options.latest ?? pinned;
  const body = options.body ?? JSON.stringify(requestDocument);
  return paperclip
    .serveAcme(data)
    .on("GET", `/api/issues/${plainTask}/interactions`, {
      body: [...data.cards, stepperCardRecord()],
    })
    .on("GET", stepperPaths.revision, { body: revisionAnswer(body, latest) })
    .on("GET", stepperPaths.latest, {
      body: { key: "stepper-request", body, latestRevisionId: latest },
    });
}

/** A client for the Acme connection that checks stepper requests against {@link stepperCatalog}. */
export function connectWithSteppers(paperclip: FakePaperclip, network: Network) {
  return new PaperclipMessaging({
    address: paperclip.address,
    key: testKey,
    connection: "acme",
    company,
    label: "Paperclip · Acme",
    userId: me,
    stepperCatalog,
    now: () => testNow,
    fetch: (input, init) =>
      network.offline
        ? Promise.reject(new TypeError("fetch failed"))
        : paperclip.fetch(input, init),
  });
}
