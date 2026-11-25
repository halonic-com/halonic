import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { githubOwner, githubRepo } from "../github-parameters.ts";
import { githubEnvironment, npmPackage, npmScope, workflowFile } from "../npm-parameters.ts";

/**
 * Replaces a trusted publisher that is about to lapse (inventory part 1, row 9).
 * npm can't edit an entry, so renewing means deleting it and adding it again.
 */
export const definition: StepperDefinition<Record<string, string | number>> = {
  id: "npm.renew-trusted-publisher",
  version: 1,
  service: "npm",
  title: "Renew a trusted publisher on an npm package",
  summary: "Removes the package's lapsing GitHub Actions trusted publisher and adds it again.",
  // It briefly removes the right to publish, then decides who gets it back.
  risk: "admin",
  parameters: strictParameters({
    scope: npmScope,
    package: npmPackage,
    owner: githubOwner,
    repo: githubRepo,
    workflow: workflowFile,
    environment: githubEnvironment,
  }),
  steps: [
    {
      kind: "guided",
      address: "https://www.npmjs.com/package/@{scope}/{package}/access",
      instructions: [
        "Sign in to npm with the account that maintains the package, if npm asks you to.",
        "Under **Trusted Publisher**, find the entry for {owner}/{repo} and {workflow}. npm can't edit an entry, so delete it: click its delete button and confirm.",
        "Under **Trusted Publisher**, click **GitHub Actions**.",
        "Fill in **Organization or user** with {owner} and **Repository** with {repo}. Both are case-sensitive and must be exact.",
        "Fill in **Workflow filename** with {workflow}: only the file name, not the path. The file must exist in `.github/workflows/` of that repository.",
        "Fill in **Environment name** with {environment}, exactly as the workflow's publish job spells it. If that is `none`, leave the field empty.",
        "Click **Set up connection**. npm doesn't check the entry when you save it, so a mistake only shows when the workflow publishes.",
        "Within 2 days, run the workflow once so it publishes: npm drops an entry that has had no successful publish in that time.",
        "Instructions follow npm's documentation: https://docs.npmjs.com/trusted-publishers",
      ],
      // From npm's public documentation; the live smoke test walks it.
      checkedOn: "2026-11-25",
    },
  ],
  targets: (parameters) => [
    {
      service: "npm",
      kind: "package",
      name: `@${parameters["scope"]}/${parameters["package"]}`,
    },
  ],
  preview: (parameters) => [
    `Opens the access settings of @${parameters["scope"]}/${parameters["package"]} on npm, where you delete its trusted publisher and add ${parameters["owner"]}/${parameters["repo"]} with ${parameters["workflow"]} again by hand. Halonic can't check it.`,
  ],
};
