import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { githubOwner, githubRepo } from "../github-parameters.ts";

type Parameters = Record<string, string | number>;

const repositoryPath = "/repos/{owner}/{repo}";

// GitHub's own page for the same change; the manual guide sends the user there.
const settingsPage = "https://github.com/{owner}/{repo}/settings";

// What each change exposes or loses, in GitHub's terms, so the user reads it before the dialog.
const consequences: Readonly<Record<string, string>> = {
  public:
    "Anyone on the internet can then see its code, its whole commit history, its issues, pull requests and releases, and fork it; making it private again doesn't take back what was public.",
  private:
    "Only people with access can then see it: its stars and watchers are removed, and public forks stay public.",
};

/**
 * Makes a repository public or private (inventory part 1, row 3). Risk
 * `irreversible`: once code is public it can't be taken back. The shell sends
 * an `irreversible` step only once its native dialog can ask the user to type
 * the repository name (HAL-20242); until then the manual guide does it.
 */
export const definition: StepperDefinition<Parameters> = {
  id: "github.set-repo-visibility",
  version: 1,
  service: "github",
  title: "Change a repository's visibility",
  summary: "Makes a repository public or private.",
  risk: "irreversible",
  parameters: strictParameters({
    owner: githubOwner,
    repo: githubRepo,
    visibility: { kind: "choice", options: ["public", "private"] },
  }),
  steps: [
    {
      kind: "check",
      path: repositoryPath,
      keep: ["visibility"],
      manual: {
        url: settingsPage,
        instructions: [
          "Under **Danger Zone**, read **Change repository visibility**: it says whether the repository is public or private.",
        ],
      },
    },
    {
      kind: "call",
      method: "PATCH",
      path: repositoryPath,
      body: [{ name: "visibility", kind: "parameter" }],
      keep: ["visibility"],
      manual: {
        url: settingsPage,
        instructions: [
          "Under **Danger Zone**, click **Change visibility**, then **Change to {visibility}**.",
          "Read what GitHub says changes, type the repository name to confirm, and click the button below it.",
        ],
      },
    },
  ],
  targets: (parameters) => [
    { service: "github", kind: "repository", name: `${parameters["owner"]}/${parameters["repo"]}` },
  ],
  preview: (parameters, current) => {
    const repository = `${parameters["owner"]}/${parameters["repo"]}`;
    const after = String(parameters["visibility"]);
    const today = current?.["visibility"];
    const change =
      typeof today === "string"
        ? `${repository} is ${today} today. After: ${after}.`
        : `Makes ${repository} ${after}.`;
    return [
      `Reads whether ${repository} is public or private; it needs your GitHub sign-in to have the Administration permission there.`,
      `${change} ${consequences[after] ?? ""}`.trim(),
    ];
  },
};
