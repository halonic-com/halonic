import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { githubOwner, githubRepo } from "../github-parameters.ts";

type Parameters = Record<string, string | number>;

/**
 * Changes a repository ruleset's required checks or merge queue (inventory
 * part 1, row 1). A ruleset's rules are a nested list that GitHub's `PUT`
 * replaces whole, which the shell's routes can't carry yet, so for now the one
 * step is `guided`: the user makes the change on the ruleset's own page. The
 * API version waits for nested bodies in the action sender (HAL-20154; plan
 * approved on HAL-20151).
 */
export const definition: StepperDefinition<Parameters> = {
  id: "github.change-ruleset",
  version: 1,
  service: "github",
  title: "Change a ruleset",
  summary: "Changes a ruleset's required checks or merge queue on GitHub's own page.",
  // A ruleset decides what may merge, so a change to it is an admin change even when made by hand.
  risk: "admin",
  parameters: strictParameters({
    owner: githubOwner,
    repo: githubRepo,
    rulesetId: { kind: "integer", min: 1, max: 999_999_999_999 },
  }),
  steps: [
    {
      kind: "guided",
      address: "https://github.com/{owner}/{repo}/settings/rules/{rulesetId}",
      instructions: [
        "Check that the page shows the ruleset the request names, and its **Enforcement status**.",
        "To change the required checks: under **Rules**, find **Require status checks to pass**, then add checks with **Add checks** or remove one with its trash icon.",
        "To change the merge queue: under **Rules**, find **Require merge queue** and change its settings.",
        "Click **Save changes** at the bottom of the page.",
      ],
      // Checked against GitHub's documentation for the page; the live smoke test walks it.
      checkedOn: "2026-11-26",
    },
  ],
  targets: (parameters) => [
    {
      service: "github",
      kind: "ruleset",
      name: `${parameters["owner"]}/${parameters["repo"]} #${parameters["rulesetId"]}`,
    },
  ],
  preview: (parameters) => [
    `Opens ruleset ${parameters["rulesetId"]} of ${parameters["owner"]}/${parameters["repo"]} on GitHub, where you change its required checks or merge queue by hand. Halonic can't check it.`,
  ],
};
