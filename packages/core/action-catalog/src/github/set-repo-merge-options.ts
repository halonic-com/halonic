import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { githubOwner, githubRepo } from "../github-parameters.ts";

type Parameters = Record<string, string | number>;

const onOrOff = { kind: "choice", options: ["on", "off"] } as const;

// The repository's settings, in GitHub's order on the page, with the page's own words.
const settings = [
  ["allow_merge_commit", "merge commits"],
  ["allow_squash_merge", "squash merging"],
  ["allow_rebase_merge", "rebase merging"],
  ["allow_auto_merge", "auto-merge"],
] as const;

/** `allow_merge_commit` on, … as one line, from booleans GitHub answered or `on`/`off` parameters. */
function settingsLine(values: Readonly<Record<string, unknown>>): string | undefined {
  const parts: string[] = [];
  for (const [field, words] of settings) {
    const value = values[field];
    if (value === true || value === "on") parts.push(`${words} on`);
    else if (value === false || value === "off") parts.push(`${words} off`);
    else return undefined;
  }
  return parts.join(", ");
}

/**
 * Turns auto-merge and the three merge methods on or off for a repository
 * (inventory part 1, row 3). The check reads today's settings for the
 * preview; the change is a `guided` step on the settings page, because a
 * parameter can't be a boolean yet, so a `PATCH /repos/{owner}/{repo}` can't
 * carry the user's choice (plan approved on HAL-20236).
 */
export const definition: StepperDefinition<Parameters> = {
  id: "github.set-repo-merge-options",
  version: 1,
  service: "github",
  title: "Change how pull requests merge",
  summary: "Turns auto-merge, merge commits, squash merging and rebase merging on or off.",
  // It changes how every pull request in the repository merges, and needs the Administration permission.
  risk: "admin",
  parameters: strictParameters({
    owner: githubOwner,
    repo: githubRepo,
    allow_merge_commit: onOrOff,
    allow_squash_merge: onOrOff,
    allow_rebase_merge: onOrOff,
    allow_auto_merge: onOrOff,
  }),
  steps: [
    {
      kind: "check",
      path: "/repos/{owner}/{repo}",
      keep: settings.map(([field]) => field),
      manual: {
        url: "https://github.com/{owner}/{repo}/settings",
        instructions: [
          "Under **Pull Requests**, read whether **Allow merge commits**, **Allow squash merging**, **Allow rebase merging** and **Allow auto-merge** are ticked.",
        ],
      },
    },
    {
      kind: "guided",
      address: "https://github.com/{owner}/{repo}/settings",
      instructions: [
        "Under **Pull Requests**, turn **Allow merge commits** {allow_merge_commit}, **Allow squash merging** {allow_squash_merge} and **Allow rebase merging** {allow_rebase_merge}. GitHub keeps at least one of them on.",
        "Turn **Allow auto-merge** {allow_auto_merge}.",
        "GitHub saves each box as you change it: check that it says the setting was saved.",
      ],
      checkedOn: "from docs",
    },
  ],
  targets: (parameters) => [
    { service: "github", kind: "repository", name: `${parameters["owner"]}/${parameters["repo"]}` },
  ],
  preview: (parameters, current) => {
    const repository = `${parameters["owner"]}/${parameters["repo"]}`;
    const after = settingsLine(parameters) ?? "";
    const today = current === undefined ? undefined : settingsLine(current);
    return [
      `Reads the merge settings of ${repository}; it needs your GitHub sign-in to have the Administration permission there.`,
      today === undefined
        ? `Opens the settings of ${repository} on GitHub, where you set ${after} by hand.`
        : `Today: ${today}. After: ${after}. Opens the settings of ${repository} on GitHub, where you set them by hand.`,
    ];
  },
};
