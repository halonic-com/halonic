import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { actionsName, variableValue } from "../github-actions-parameters.ts";
import { githubOwner, githubRepo } from "../github-parameters.ts";

type Parameters = Record<string, string | number>;

const variablePath = "/repos/{owner}/{repo}/actions/variables/{name}";

// GitHub's own page for the same change; the manual guide sends the user there.
const variablesPage = "https://github.com/{owner}/{repo}/settings/variables/actions";

/**
 * Changes the value of an existing GitHub Actions variable (inventory row 2).
 * Declarative steps can't branch, so creating one is its own definition,
 * `github.create-actions-variable`, and a scripted action may join the two
 * once ToolScript runs (plan approved on HAL-17520). The value isn't secret,
 * so it's a parameter and the preview shows it next to today's.
 */
export const definition: StepperDefinition<Parameters> = {
  id: "github.set-actions-variable",
  version: 1,
  service: "github",
  title: "Change an Actions variable",
  summary: "Changes the value of a GitHub Actions variable that already exists.",
  // Workflows read it, so a change can alter what a build or release does.
  risk: "admin",
  parameters: strictParameters({
    owner: githubOwner,
    repo: githubRepo,
    name: actionsName,
    value: variableValue,
  }),
  steps: [
    {
      kind: "check",
      path: variablePath,
      keep: ["name", "value"],
      manual: {
        url: variablesPage,
        instructions: [
          "On the **Variables** tab, find {name} and read its value.",
          "If {name} isn't listed, use **Create an Actions variable** instead.",
        ],
      },
    },
    {
      kind: "call",
      method: "PATCH",
      path: variablePath,
      body: [{ name: "value", kind: "parameter" }],
      keep: [],
      manual: {
        url: variablesPage,
        instructions: [
          "Click the pencil icon next to {name}.",
          "Set **Value** to {value}, then click **Update variable**.",
        ],
      },
    },
  ],
  targets: (parameters) => [
    {
      service: "github",
      kind: "Actions variable",
      name: `${parameters["owner"]}/${parameters["repo"]} ${parameters["name"]}`,
    },
  ],
  preview: (parameters, current) => {
    const name = `\`${parameters["name"]}\``;
    const repository = `${parameters["owner"]}/${parameters["repo"]}`;
    const after = `\`${parameters["value"]}\``;
    const today = current?.["value"];
    return [
      `Reads the Actions variable ${name} of ${repository}. If GitHub answers "not found", it doesn't exist yet: then use "Create an Actions variable".`,
      typeof today === "string"
        ? `${name} today: \`${today}\`. After: ${after}.`
        : `Sets the Actions variable ${name} of ${repository} to ${after}.`,
    ];
  },
};
