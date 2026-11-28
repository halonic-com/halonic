import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { githubOwner, githubRepo } from "../github-parameters.ts";
import { paperclipCompany, paperclipHost } from "../paperclip-parameters.ts";

/**
 * Adds a GitHub repository to a Paperclip project as one of its workspaces,
 * so the project's agents work in it (stream HAL-17488, architecture note on
 * HAL-17491, section 5 row 16). It is the Paperclip half of creating a
 * repository: `github.create-repository` makes and sets up the repository,
 * and a request adds this as a second block, because a guided page opens on
 * its own service's host (D4 of the plan Liam approved on HAL-21185). It
 * stays `guided` with no Paperclip call: an API step needs its own review.
 */
export const definition: StepperDefinition<Record<string, string | number>> = {
  id: "paperclip.add-project-repository",
  version: 1,
  service: "paperclip",
  title: "Add a repository to a Paperclip project",
  summary: "You add a GitHub repository to a project on Paperclip's own project page.",
  // The project's agents work in the repository from their next run.
  risk: "admin",
  parameters: strictParameters({
    host: paperclipHost,
    company: paperclipCompany,
    // A project's key in Paperclip's addresses, such as `workspace-company`.
    project: { kind: "text", pattern: /^[a-z0-9][a-z0-9-]{0,99}$/ },
    owner: githubOwner,
    repo: githubRepo,
  }),
  steps: [
    {
      kind: "guided",
      address: "https://{host}/{company}/projects/{project}",
      instructions: [
        "Sign in to this Paperclip as a board member if the page asks.",
        "Open the project's **Workspaces** and click **Add workspace**.",
        "Choose GitHub, add the repository {owner}/{repo}, and save.",
      ],
      // Written from Paperclip's project workspaces; the live smoke test walks it.
      checkedOn: "2026-11-28",
    },
  ],
  targets: (parameters) => [
    { service: "paperclip", kind: "Paperclip", name: String(parameters["host"]) },
    { service: "paperclip", kind: "project", name: String(parameters["project"]) },
  ],
  preview: (parameters) => [
    `Opens the project ${parameters["project"]} of ${parameters["company"]} on ${parameters["host"]}, where you add the repository ${parameters["owner"]}/${parameters["repo"]} as a workspace. Its agents work in it from their next run.`,
  ],
};
