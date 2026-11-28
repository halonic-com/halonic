import {
  type CheckStep,
  type GuidedStep,
  type StepperDefinition,
  strictParameters,
} from "@halonicjs/action-steppers";
import { githubEnvironment } from "../github-environment-parameters.ts";
import { githubOwner, githubRepo } from "../github-parameters.ts";

type EnvironmentParameters = Record<string, string | number>;
// What the checks kept, as the stepper hands it to the preview.
type Kept = NonNullable<Parameters<StepperDefinition["preview"]>[1]>;

const environmentPath = "/repos/{owner}/{repo}/environments/{environment}";
const environmentsPage = "https://github.com/{owner}/{repo}/settings/environments";

// The fields both checks read. Reviewers and the wait timer sit in the
// `protection_rules` list, which `keep` can't index, so the page shows them.
const environmentFields = [
  "name",
  "can_admins_bypass",
  "deployment_branch_policy.protected_branches",
  "deployment_branch_policy.custom_branch_policies",
] as const;

/** The guided step where the user sets {environment}'s protection rules; `github.create-repository` reuses it. */
export const environmentProtectionGuided: GuidedStep = {
  kind: "guided",
  address: environmentsPage,
  instructions: [
    "Click {environment}.",
    "Under **Deployment protection rules**, tick **Required reviewers** and add {reviewer}.",
    "Tick **Wait timer** and set it to {wait_timer} minutes, or untick it for 0.",
    "Click **Save protection rules**.",
    "Under **Deployment branches and tags**, choose {branches}.",
  ],
  // Checked against GitHub's documentation for the page; the live smoke test walks it.
  checkedOn: "2026-11-27",
};

/** The check that {environment} was saved after the stepper opened; `github.create-repository` reuses it. */
export const environmentSavedCheck: CheckStep = {
  kind: "check",
  path: environmentPath,
  keep: [...environmentFields, "updated_at"],
  changedAfterStart: "updated_at",
  manual: {
    url: environmentsPage,
    instructions: ["Click {environment} and check the rules you just set are shown."],
  },
};

/**
 * Sets up a GitHub environment's protection rules by hand (inventory row
 * 10): the user changes them on GitHub's own page, with their own sign-in
 * (board rule). A guided step, not a `PUT`, because the reviewer list and
 * branch policy are nested objects the shell has no body kind for (Liam's
 * approval on HAL-17522; the `PUT` is HAL-20272). A check reads the
 * environment before, and one after checks it was saved since the stepper
 * opened, so the preview can set today's branch policy next to the change.
 */
export const definition: StepperDefinition<EnvironmentParameters> = {
  id: "github.configure-environment",
  version: 1,
  service: "github",
  title: "Set up an environment's protection",
  summary:
    "You set a GitHub environment's required reviewer, wait timer and branches on GitHub's own page.",
  // It decides who may let a deployment through.
  risk: "admin",
  parameters: strictParameters({
    owner: githubOwner,
    repo: githubRepo,
    environment: githubEnvironment,
    reviewer: githubOwner,
    wait_timer: { kind: "integer", min: 0, max: 43_200 },
    branches: { kind: "choice", options: ["No restriction", "Protected branches only"] },
  }),
  steps: [
    {
      kind: "check",
      path: environmentPath,
      keep: environmentFields,
      manual: {
        url: environmentsPage,
        instructions: ["Click {environment} and note its protection rules."],
      },
    },
    environmentProtectionGuided,
    environmentSavedCheck,
  ],
  targets: (parameters) => [
    {
      service: "github",
      kind: "environment",
      name: `${parameters["owner"]}/${parameters["repo"]} ${parameters["environment"]}`,
    },
  ],
  preview: (parameters, current = {}) => {
    const environment = `\`${parameters["environment"]}\` of ${parameters["owner"]}/${parameters["repo"]}`;
    return [
      todaySentence(environment, current),
      `Opens the environment settings on GitHub, where you add \`${parameters["reviewer"]}\` as required reviewer, set the wait timer to ${parameters["wait_timer"]} minutes and choose "${parameters["branches"]}".`,
      `Then checks on GitHub that ${environment} was saved after this stepper opened.`,
    ];
  },
};

/** Today's branch policy, once the first check read it. */
function todaySentence(environment: string, current: Kept): string {
  if (current["name"] === undefined) return `Reads the environment ${environment}.`;
  const protectedOnly = current["deployment_branch_policy.protected_branches"] === true;
  const custom = current["deployment_branch_policy.custom_branch_policies"] === true;
  let branches = "any branch";
  if (protectedOnly) branches = "protected branches only";
  else if (custom) branches = "selected branches and tags";
  return `Today, ${environment} deploys from ${branches}.`;
}
