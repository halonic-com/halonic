import type { StepperCatalog, StepperDefinition } from "./stepper-types.ts";
import { strictParameters } from "./strict-parameters.ts";

// An invented catalog for tests: the `acme` organisation, never a real workspace.

const owner = { kind: "text", pattern: /^[A-Za-z0-9-]{1,39}$/ } as const;
const repo = { kind: "text", pattern: /^[A-Za-z0-9._-]{1,100}$/ } as const;

/** A guided step type that sets a GitHub Actions variable on a repository. */
export const setVariable: StepperDefinition<Record<string, string | number>> = {
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
  ],
  targets: (parameters) => [
    { service: "github", kind: "repository", name: `${parameters["owner"]}/${parameters["repo"]}` },
  ],
  preview: (parameters) => [
    `Sets the variable ${parameters["name"]} on ${parameters["owner"]}/${parameters["repo"]}.`,
  ],
};

/** An API step type that adds a DNS record to a Cloudflare zone. */
export const addDnsRecord: StepperDefinition<Record<string, string | number>> = {
  id: "cloudflare.add-dns-record",
  version: 1,
  service: "cloudflare",
  title: "Add a DNS record",
  summary: "Adds one record to a zone.",
  risk: "admin",
  parameters: strictParameters({
    zone: { kind: "text", pattern: /^[a-z0-9.-]{1,253}$/ },
    type: { kind: "choice", options: ["A", "CNAME", "TXT"] },
  }),
  steps: [{ kind: "script", ref: "cloudflare/add-dns-record" }],
  targets: (parameters) => [
    { service: "cloudflare", kind: "zone", name: String(parameters["zone"]) },
  ],
  preview: (parameters) => [`Adds a ${parameters["type"]} record to ${parameters["zone"]}.`],
};

/** The invented catalog: two step types, no whole definitions, and GitHub's variables and rules pages. */
export const acmeCatalog: StepperCatalog = {
  definition: (id, version) =>
    id === "github.approve-run" && version === 1 ? { ...setVariable, id } : undefined,
  stepType: (id, version) =>
    [setVariable, addDnsRecord].find((type) => type.id === id && type.version === version),
  browserOrigins: [
    {
      service: "github",
      host: "github.com",
      pathPrefixes: ["/{owner}/{repo}/settings/variables/", "/{owner}/{repo}/settings/rules/"],
    },
  ],
};
