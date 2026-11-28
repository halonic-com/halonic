import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { actionsName } from "../github-actions-parameters.ts";
import { githubEnvironment, githubId } from "../github-environment-parameters.ts";
import { githubOwner, newGithubRepo } from "../github-parameters.ts";
import { withPlaceholders } from "../step-placeholders.ts";
import { environmentProtectionGuided, environmentSavedCheck } from "./configure-environment.ts";
import { secretGuided, secretSavedCheck } from "./set-actions-secret.ts";

type RepositoryParameters = Record<string, string | number>;
// What the checks kept, as the stepper hands it to the preview.
type Kept = NonNullable<Parameters<StepperDefinition["preview"]>[1]>;

const repositoryPath = "/repos/{owner}/{name}";
const repositoryPage = "https://github.com/{owner}/{name}";

// The reused steps say `repo` for the repository and `name` for the secret;
// here the repository is `name`, GitHub's body field, and the secret `secret`.
const renamed = { repo: "name", name: "secret" } as const;

// Our defaults for a new repository, in GitHub's words, as the create call sends them and the last check reads them.
const repositoryDefaults = [
  ["allow_squash_merge", true, "squash merging"],
  ["allow_merge_commit", false, "merge commits"],
  ["allow_rebase_merge", false, "rebase merging"],
  ["allow_auto_merge", true, "auto-merge"],
  ["delete_branch_on_merge", true, "deleting the branch after a merge"],
] as const;

/** The label every repository the agents work in carries, so Paperclip's pull requests can be found. */
const builtOnLabel = "built-on:paperclip";

/**
 * Creates a repository in a GitHub organisation and sets it up the way ours
 * are (stream HAL-17488, architecture note on HAL-17491, section 5 row 16),
 * after the board said yes on a card: create it with our merge defaults,
 * then add our label, an environment with its protection, the ruleset, one
 * Actions secret and the agents' GitHub App access, make it public if the
 * request asks, and read the settings back. It is always created private, so
 * nothing is seen before its rules and access are in place, and because the
 * shell's patterns have no `private|public` for a body field (D5). It reuses the reviewed environment and secret steps of
 * `github.configure-environment` and `github.set-actions-secret`. Paperclip's
 * project registration is `paperclip.add-project-repository`, a second block
 * of the same request, because a guided page opens on its own service's host.
 *
 * `irreversible`, for private repositories too, since risk is the
 * definition's (D1 of the plan Liam approved on HAL-21185): once a public
 * repository's name and code are out they can't be taken back. Each call asks
 * the user to type the repository as `{owner}/{name}`. The agents' access is
 * guided until a call can send a value an earlier step kept: GitHub's
 * `PUT /user/installations/{id}/repositories/{repository_id}` needs the new
 * repository's id (D3, HAL-21193).
 *
 * It needs the user's GitHub sign-in to have organisation Administration:
 * write (to create it), repository Administration: write (label, environment,
 * ruleset) and Secrets: read (the secret's check).
 */
export const definition: StepperDefinition<RepositoryParameters> = {
  id: "github.create-repository",
  version: 1,
  service: "github",
  title: "Create a repository",
  summary:
    "Creates a repository in a GitHub organisation with our defaults, and gives the agents access.",
  // A public repository can't be taken back once it is seen, and risk is the whole definition's.
  risk: "irreversible",
  parameters: strictParameters({
    owner: githubOwner,
    name: newGithubRepo,
    visibility: { kind: "choice", options: ["private", "public"] },
    environment: githubEnvironment,
    reviewer: githubOwner,
    wait_timer: { kind: "integer", min: 0, max: 43_200 },
    branches: { kind: "choice", options: ["No restriction", "Protected branches only"] },
    secret: actionsName,
    installation_id: githubId,
  }),
  steps: [
    {
      kind: "call",
      method: "POST",
      path: "/orgs/{owner}/repos",
      body: [
        { name: "name", kind: "parameter" },
        { name: "visibility", kind: "constant", value: "private" },
        { name: "auto_init", kind: "constant", value: true },
        ...repositoryDefaults.map(([field, value]) => ({
          name: field,
          kind: "constant" as const,
          value,
        })),
      ],
      keep: ["id", "full_name", "default_branch"],
      // The name the user types in the shell's native dialog, the repository's from the body.
      target: "{owner}/{name}",
      manual: {
        url: "https://github.com/organizations/{owner}/repositories/new",
        instructions: [
          "Set **Repository name** to {name}.",
          "Choose **Private**, and tick **Add a README file**.",
          "Click **Create repository**.",
          "On the new repository's **Settings** page, under **Pull Requests**, allow squash merging only, and tick **Allow auto-merge** and **Automatically delete head branches**.",
        ],
      },
    },
    {
      kind: "check",
      path: repositoryPath,
      keep: ["visibility", "default_branch"],
      requires: [
        {
          name: "visibility",
          equals: "private",
          reason: "GitHub didn't make the new repository private, so nothing else is set up.",
        },
        {
          name: "default_branch",
          equals: "main",
          reason:
            "The new repository's default branch isn't `main`. Rename it on GitHub's Branches page, then resume.",
        },
      ],
      manual: {
        url: repositoryPage,
        instructions: [
          "Check that the repository shows **Private** next to its name, and that its branch is `main`.",
        ],
      },
    },
    {
      kind: "call",
      method: "POST",
      path: `${repositoryPath}/labels`,
      body: [
        { name: "name", kind: "constant", value: builtOnLabel },
        { name: "color", kind: "constant", value: "1d76db" },
        { name: "description", kind: "constant", value: "Made by an agent in Paperclip." },
      ],
      keep: [],
      target: "{owner}/{name}",
      manual: {
        url: `${repositoryPage}/labels`,
        instructions: [
          `Click **New label**, set **Label name** to \`${builtOnLabel}\` and click **Create label**.`,
        ],
      },
    },
    {
      kind: "call",
      method: "PUT",
      path: `${repositoryPath}/environments/{environment}`,
      body: [],
      keep: [],
      target: "{owner}/{name}",
      manual: {
        url: `${repositoryPage}/settings/environments/new`,
        instructions: ["Set **Name** to {environment} and click **Configure environment**."],
      },
    },
    withPlaceholders(environmentProtectionGuided, renamed),
    withPlaceholders(environmentSavedCheck, renamed),
    {
      kind: "guided",
      address: `${repositoryPage}/settings/rules/new`,
      instructions: [
        "Set **Ruleset Name** to `main` and **Enforcement status** to **Active**.",
        "Under **Target branches**, click **Add target** and choose **Include default branch**.",
        "Under **Rules**, tick **Require a pull request before merging**, **Require status checks to pass** with the check `ci-ok`, **Require merge queue** and **Block force pushes**.",
        "Click **Create**.",
      ],
      // Checked against GitHub's documentation for the page; the live smoke test walks it.
      checkedOn: "2026-11-28",
    },
    withPlaceholders(secretGuided, renamed),
    withPlaceholders(secretSavedCheck, renamed),
    {
      kind: "guided",
      address: "https://github.com/organizations/{owner}/settings/installations/{installation_id}",
      instructions: [
        "Under **Repository access**, if **All repositories** is chosen, the agents already have {name}: go on.",
        "Otherwise, with **Only select repositories** chosen, click **Select repositories**, choose {name}, and click **Save**.",
      ],
      // Checked against GitHub's documentation for the page; the live smoke test walks it.
      checkedOn: "2026-11-28",
    },
    {
      kind: "guided",
      address: `${repositoryPage}/settings`,
      instructions: [
        "The request asks for a {visibility} repository. If that's `private`, there's nothing to do here: it is private already.",
        "If it's `public`: under **Danger Zone**, click **Change visibility**, then **Change to public**.",
        "Read what GitHub says changes, type the repository's name to confirm, and click the button below it.",
      ],
      // Checked against GitHub's documentation for the page; the live smoke test walks it.
      checkedOn: "2026-11-28",
    },
    {
      kind: "check",
      path: repositoryPath,
      // No `requires`: nothing runs after it. The preview sets each setting next to our default.
      keep: ["default_branch", "visibility", ...repositoryDefaults.map(([field]) => field)],
      manual: {
        url: `${repositoryPage}/settings`,
        instructions: [
          "Check that the default branch is `main`, and that under **Pull Requests** only squash merging is allowed, with auto-merge and deleting head branches ticked.",
        ],
      },
    },
  ],
  targets: (parameters) => [
    {
      service: "github",
      kind: "repository",
      name: `${parameters["owner"]}/${parameters["name"]}`,
    },
  ],
  preview: (parameters, current = {}) => previewOf(parameters, current),
};

function previewOf(parameters: RepositoryParameters, current: Kept): readonly string[] {
  const repository = `${parameters["owner"]}/${parameters["name"]}`;
  const environment = `\`${parameters["environment"]}\``;
  const secret = `\`${parameters["secret"]}\``;
  const visibility = String(parameters["visibility"]);
  const madePublic =
    visibility === "public"
      ? `Opens ${repository}'s settings, where you make it public. Everyone can then see it, and that can't be undone.`
      : `Opens ${repository}'s settings; it stays private, so there is nothing to change.`;
  return [
    `Creates the private repository ${repository} with a README, squash merging only, auto-merge on and branches deleted after a merge.`,
    `Checks on GitHub that ${repository} is private and its default branch is \`main\`, and stops here if not.`,
    `Adds the label \`${builtOnLabel}\` to ${repository}.`,
    `Creates the environment ${environment} in ${repository}.`,
    `Opens the environment settings on GitHub, where you add \`${parameters["reviewer"]}\` as required reviewer, set the wait timer to ${parameters["wait_timer"]} minutes and choose "${parameters["branches"]}".`,
    `Then checks on GitHub that ${environment} was saved after this stepper opened.`,
    `Opens a new ruleset for ${repository}'s default branch, where you require pull requests, the check \`ci-ok\` and the merge queue.`,
    `Opens the Actions secrets of ${repository} on GitHub, where you type the value of ${secret} yourself. Halonic never sees it.`,
    `Then checks on GitHub that ${secret} was saved after this stepper opened.`,
    `Opens the agents' GitHub App installation ${parameters["installation_id"]}, where you give it access to ${repository}.`,
    madePublic,
    settingsSentence(repository, visibility, current),
  ];
}

/** The settings GitHub answered next to our defaults, once the last check read them. */
function settingsSentence(repository: string, visibility: string, current: Kept): string {
  const branch = current["default_branch"];
  if (typeof branch !== "string") {
    return `Reads ${repository}'s settings back and shows them next to our defaults.`;
  }
  const settings = repositoryDefaults.map(([field, wanted, words]) => {
    const value = current[field];
    const today = value === true ? "on" : "off";
    const mark = value === wanted ? "as our default" : `our default is ${wanted ? "on" : "off"}`;
    return `${words} ${today} (${mark})`;
  });
  const shown = String(current["visibility"]);
  const asked = shown === visibility ? "as asked" : `the request asked for ${visibility}`;
  return `${repository}: ${shown} (${asked}), default branch \`${branch}\`, ${settings.join(", ")}.`;
}
