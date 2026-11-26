import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { githubOwner, githubRepo } from "../github-parameters.ts";

type Parameters = Record<string, string | number>;

const reviewsPath =
  "/repos/{owner}/{repo}/branches/{branch}/protection/required_pull_request_reviews";

// GitHub's own page for the same change; the manual guide sends the user there.
const branchesPage = "https://github.com/{owner}/{repo}/settings/branches";

/**
 * Changes how many approving reviews a pull request into a branch needs
 * (inventory part 1, row 1). It uses GitHub's narrow endpoint for the review
 * rule, not the whole-protection `PUT`, which replaces every setting: the
 * `PATCH` sends only the count and leaves the rest of the rule as it is
 * (plan approved on HAL-20151). Only classic branch protection: GitHub
 * answers 404 here for a branch with no classic rule that requires reviews,
 * such as one a ruleset governs, so the check and the guide point to
 * `github.change-ruleset` for it.
 */
export const definition: StepperDefinition<Parameters> = {
  id: "github.change-branch-protection",
  version: 1,
  service: "github",
  title: "Change the required reviews on a branch",
  summary: "Sets how many approving reviews a pull request needs before it can merge.",
  // It weakens or tightens what protects a branch, and needs the Administration permission.
  risk: "admin",
  parameters: strictParameters({
    owner: githubOwner,
    repo: githubRepo,
    // One path segment only: a name with `/` can't fill the `{branch}` placeholder.
    branch: { kind: "text", pattern: /^[A-Za-z0-9._-]{1,100}$/ },
    // GitHub allows 0 to 6 required approvals.
    required_approving_review_count: { kind: "integer", min: 0, max: 6 },
  }),
  steps: [
    {
      kind: "check",
      path: reviewsPath,
      keep: [
        "required_approving_review_count",
        "dismiss_stale_reviews",
        "require_code_owner_reviews",
        "require_last_push_approval",
      ],
      manual: {
        url: branchesPage,
        instructions: [
          "Under **Branch protection rules**, find the rule for {branch} and click **Edit**.",
          "Under **Require a pull request before merging**, read **Required number of approvals before merging**.",
          "If no rule for {branch} requires reviews, a ruleset may protect it: look under **Rules** › **Rulesets** and use **Change a ruleset** instead.",
        ],
      },
    },
    {
      kind: "call",
      method: "PATCH",
      path: reviewsPath,
      body: [{ name: "required_approving_review_count", kind: "parameter" }],
      keep: ["required_approving_review_count"],
      manual: {
        url: branchesPage,
        instructions: [
          "Set **Required number of approvals before merging** to {required_approving_review_count}.",
          "Click **Save changes**.",
        ],
      },
    },
  ],
  targets: (parameters) => [
    {
      service: "github",
      kind: "branch",
      name: `${parameters["owner"]}/${parameters["repo"]}:${parameters["branch"]}`,
    },
  ],
  preview: (parameters, current) => {
    const branch = `\`${parameters["branch"]}\``;
    const repository = `${parameters["owner"]}/${parameters["repo"]}`;
    const after = parameters["required_approving_review_count"];
    const today = current?.["required_approving_review_count"];
    return [
      `Reads the review rule of ${branch} in ${repository}; it needs your GitHub sign-in to have the Administration permission there. If GitHub answers "not found", no classic branch protection rule requires reviews on ${branch}; a ruleset may protect it instead: then use "Change a ruleset".`,
      typeof today === "number"
        ? `Required reviews on ${branch} today: ${today}. After: ${after}.`
        : `Sets the required reviews on ${branch} in ${repository} to ${after}.`,
    ];
  },
};
