import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { actionsName, variableValue } from "../github-actions-parameters.ts";
import { githubOwner, githubRepo } from "../github-parameters.ts";

type Parameters = Record<string, string | number>;

/**
 * Creates a GitHub Actions variable (inventory row 2). GitHub answers 409 when
 * one of that name exists; the preview and the guide then point to
 * `github.set-actions-variable`, since declarative steps can't branch to it
 * (plan approved on HAL-17520).
 */
export const definition: StepperDefinition<Parameters> = {
  id: "github.create-actions-variable",
  version: 1,
  service: "github",
  title: "Create an Actions variable",
  summary: "Adds a new GitHub Actions variable to a repository.",
  // Workflows read it, so a new one can alter what a build or release does.
  risk: "admin",
  parameters: strictParameters({
    owner: githubOwner,
    repo: githubRepo,
    name: actionsName,
    value: variableValue,
  }),
  steps: [
    {
      kind: "call",
      method: "POST",
      path: "/repos/{owner}/{repo}/actions/variables",
      body: [
        { name: "name", kind: "parameter" },
        { name: "value", kind: "parameter" },
      ],
      keep: [],
      manual: {
        url: "https://github.com/{owner}/{repo}/settings/variables/actions/new",
        instructions: [
          "Set **Name** to {name} and **Value** to {value}.",
          "Click **Add variable**. If GitHub says the name is already in use, use **Change an Actions variable** instead.",
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
  preview: (parameters) => [
    `Creates the Actions variable \`${parameters["name"]}\` in ${parameters["owner"]}/${parameters["repo"]} with the value \`${parameters["value"]}\`. If GitHub answers that it already exists, use "Change an Actions variable" instead.`,
  ],
};
