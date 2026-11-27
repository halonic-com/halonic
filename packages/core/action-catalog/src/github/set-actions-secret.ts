import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { actionsName } from "../github-actions-parameters.ts";
import { githubOwner, githubRepo } from "../github-parameters.ts";

type Parameters = Record<string, string | number>;

const secretsPage = "https://github.com/{owner}/{repo}/settings/secrets/actions";

/**
 * Sets a GitHub Actions repository secret by hand (inventory row 2). The user
 * types the value on GitHub's own page, so it never enters a request, a
 * parameter, the event log or an agent (board rule; Julian's decision 5 on
 * HAL-17491 keeps it guided until sealed-box encryption has its own review).
 * Then a `check` reads the secret's `updated_at`, never its value (GitHub's
 * API has no way to read one), which must be later than when the stepper
 * opened, so the stepper knows the user really saved it.
 */
export const definition: StepperDefinition<Parameters> = {
  id: "github.set-actions-secret",
  version: 1,
  service: "github",
  title: "Set an Actions secret",
  summary: "You type a GitHub Actions secret on GitHub's own page; Halonic checks it was saved.",
  // Workflows use it, often to deploy or publish.
  risk: "admin",
  parameters: strictParameters({ owner: githubOwner, repo: githubRepo, name: actionsName }),
  steps: [
    {
      kind: "guided",
      address: secretsPage,
      instructions: [
        "On the **Secrets** tab, under **Repository secrets**, find {name} and click its pencil icon. If it isn't listed, click **New repository secret** and set **Name** to {name}.",
        "Paste or type the value into **Secret** (or **Value**). Type it only there, never in a chat or a request.",
        "Click **Update secret** (or **Add secret**).",
      ],
      // Checked against GitHub's documentation for the page; the live smoke test walks it.
      checkedOn: "2026-11-27",
    },
    {
      kind: "check",
      path: "/repos/{owner}/{repo}/actions/secrets/{name}",
      keep: ["name", "updated_at"],
      changedAfterStart: "updated_at",
      manual: {
        url: secretsPage,
        instructions: [
          "Check that {name} is listed under **Repository secrets** and was updated just now.",
        ],
      },
    },
  ],
  targets: (parameters) => [
    {
      service: "github",
      kind: "Actions secret",
      name: `${parameters["owner"]}/${parameters["repo"]} ${parameters["name"]}`,
    },
  ],
  preview: (parameters) => {
    const name = `\`${parameters["name"]}\``;
    const repository = `${parameters["owner"]}/${parameters["repo"]}`;
    return [
      `Opens the Actions secrets of ${repository} on GitHub, where you type the value of ${name} yourself. Halonic never sees it.`,
      `Then checks on GitHub that ${name} was saved after this stepper opened.`,
    ];
  },
};
