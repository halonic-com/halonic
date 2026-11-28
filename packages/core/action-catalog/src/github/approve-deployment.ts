import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { githubEnvironment, githubId } from "../github-environment-parameters.ts";
import { githubOwner, githubRepo } from "../github-parameters.ts";

type DeploymentParameters = Record<string, string | number>;
// What the checks kept, as the stepper hands it to the preview.
type Kept = NonNullable<Parameters<StepperDefinition["preview"]>[1]>;

const runPath = "/repos/{owner}/{repo}/actions/runs/{run_id}";

// GitHub's own page for the run; its **Review deployments** button does the same approval.
const runPage = "https://github.com/{owner}/{repo}/actions/runs/{run_id}";

/**
 * Approves a workflow run waiting on a protected environment (inventory row
 * 8), as the user, who is one of its required reviewers (board rule). It
 * starts a release, so it's `irreversible`. The first check stops it unless
 * the run is still waiting and its head commit is the one the request saw.
 * The second reads the environment by name and stops unless GitHub's id for
 * it is the `environment_id` the approval sends, so the name the preview
 * shows comes from the same read as the id GitHub gets, never from the
 * request (option b of Liam's approval on HAL-17522: a body field can't take
 * a kept value). There is no check on `pending_deployments`: its answer is a
 * list `keep` can't read, and GitHub refuses the approval with a 422 for an
 * environment the run isn't waiting on.
 */
export const definition: StepperDefinition<DeploymentParameters> = {
  id: "github.approve-deployment",
  version: 1,
  service: "github",
  title: "Approve a deployment",
  summary: "Approves a workflow run waiting for your review on a GitHub environment.",
  // It starts the deployment, which no later step can take back.
  risk: "irreversible",
  parameters: strictParameters({
    owner: githubOwner,
    repo: githubRepo,
    run_id: githubId,
    environment: githubEnvironment,
    environment_id: githubId,
  }),
  steps: [
    {
      kind: "check",
      path: runPath,
      keep: ["status", "head_sha", "head_branch", "triggering_actor.login"],
      requires: [
        {
          name: "status",
          equals: "waiting",
          reason: "This run is no longer waiting for approval, so there is nothing to approve.",
        },
      ],
      requiredExpect: ["head_sha"],
      manual: {
        url: runPage,
        instructions: [
          "Check that the run says **Waiting** and that its commit is the one in the request.",
        ],
      },
    },
    {
      kind: "check",
      path: "/repos/{owner}/{repo}/environments/{environment}",
      keep: ["id", "name"],
      requires: [
        {
          name: "id",
          equalsParameter: "environment_id",
          reason: "GitHub's environment by this name isn't the one this request approves.",
        },
      ],
      manual: {
        url: "https://github.com/{owner}/{repo}/settings/environments",
        instructions: ["Check that {environment} is listed."],
      },
    },
    {
      kind: "call",
      method: "POST",
      path: `${runPath}/pending_deployments`,
      body: [
        { name: "environment_ids", kind: "parameter-list", parameter: "environment_id" },
        { name: "state", kind: "constant", value: "approved" },
        { name: "comment", kind: "constant", value: "Approved in Halonic." },
      ],
      keep: [],
      // The name the user types in the shell's native dialog before the approval is sent.
      target: "{owner}/{repo} run {run_id}",
      manual: {
        url: runPage,
        instructions: [
          "Click **Review deployments**.",
          "Tick {environment} only, then click **Approve and deploy**.",
        ],
      },
    },
  ],
  targets: (parameters) => [
    {
      service: "github",
      kind: "workflow run",
      name: `${parameters["owner"]}/${parameters["repo"]} run ${parameters["run_id"]}`,
    },
  ],
  preview: (parameters, current = {}) => {
    const run = `run ${parameters["run_id"]} of ${parameters["owner"]}/${parameters["repo"]}`;
    return [
      runSentence(run, current),
      environmentSentence(parameters, current),
      approval(run, parameters, current),
    ];
  },
};

/** The run as GitHub answered it, or what the check will read. */
function runSentence(run: string, current: Kept): string {
  const commit = current["head_sha"];
  const branch = current["head_branch"];
  const actor = current["triggering_actor.login"];
  if (typeof commit !== "string" || typeof branch !== "string") {
    return `Reads ${run} on GitHub. It stops unless the run is still waiting for approval, on the commit the request names.`;
  }
  const who = typeof actor === "string" ? `, started by \`${actor}\`` : "";
  return `${capitalised(run)}: commit \`${commit.slice(0, 7)}\` on \`${branch}\`${who}.`;
}

/** The environment by the name GitHub answered, never the request's. */
function environmentSentence(parameters: DeploymentParameters, current: Kept): string {
  const name = current["name"];
  const id = parameters["environment_id"];
  return typeof name === "string"
    ? `Environment \`${name}\` (id ${id}).`
    : `Reads the environment the request names, and stops unless GitHub's id for it is ${id}.`;
}

function approval(run: string, parameters: DeploymentParameters, current: Kept): string {
  const name = current["name"];
  const environment =
    typeof name === "string" ? `\`${name}\`` : `id ${parameters["environment_id"]}`;
  return `Approves ${run} for the environment ${environment}. This starts the deployment and can't be undone.`;
}

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
