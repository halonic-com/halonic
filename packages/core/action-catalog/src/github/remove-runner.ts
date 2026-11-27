import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { githubOwner, githubRepo } from "../github-parameters.ts";

type Parameters = Record<string, string | number>;

const runnerPath = "/repos/{owner}/{repo}/actions/runners/{runner_id}";

// GitHub's own page for the same change; the manual guide sends the user there.
const runnersPage = "https://github.com/{owner}/{repo}/settings/actions/runners";

/**
 * Removes a self-hosted runner from a repository (inventory part 1, row 3).
 * The check reads the runner first and stops while it is online, since a
 * removed runner that is still running drops the job it has (plan approved on
 * HAL-20236). Risk `admin`, not `irreversible`: the runner can be registered
 * again with a new token, and the shell can't yet send an `irreversible` step
 * (HAL-20242).
 */
export const definition: StepperDefinition<Parameters> = {
  id: "github.remove-runner",
  version: 1,
  service: "github",
  title: "Remove a self-hosted runner",
  summary: "Removes an offline self-hosted runner from a repository.",
  // It changes which machines run the repository's jobs, and needs the Administration permission.
  risk: "admin",
  parameters: strictParameters({
    owner: githubOwner,
    repo: githubRepo,
    runner_id: { kind: "integer", min: 1, max: 9_007_199_254_740_991 },
  }),
  steps: [
    {
      kind: "check",
      path: runnerPath,
      keep: ["name", "status", "busy"],
      requires: [
        {
          name: "status",
          equals: "offline",
          reason: "The runner is still online. Stop it on its machine first, then try again.",
        },
      ],
      manual: {
        url: runnersPage,
        instructions: [
          "Find the runner with ID {runner_id} and read its status.",
          "If it says **Idle** or **Active**, it is online: stop it on its machine first.",
        ],
      },
    },
    {
      kind: "call",
      method: "DELETE",
      path: runnerPath,
      body: [],
      keep: [],
      manual: {
        url: runnersPage,
        instructions: [
          "Click the runner with ID {runner_id}, then click **Remove**.",
          "Click **Force remove this runner**.",
        ],
      },
    },
  ],
  targets: (parameters) => [
    {
      service: "github",
      kind: "runner",
      name: `${parameters["owner"]}/${parameters["repo"]} #${parameters["runner_id"]}`,
    },
  ],
  preview: (parameters, current) => {
    const repository = `${parameters["owner"]}/${parameters["repo"]}`;
    const runner = `runner ${parameters["runner_id"]}`;
    const name = current?.["name"];
    const named = typeof name === "string" ? `${runner} (\`${name}\`)` : runner;
    return [
      `Reads ${runner} of ${repository}; it needs your GitHub sign-in to have the Administration permission there. If the runner is online, Halonic stops here.`,
      `Removes ${named} from ${repository}. Jobs that need it wait until another runner picks them up.`,
    ];
  },
};
