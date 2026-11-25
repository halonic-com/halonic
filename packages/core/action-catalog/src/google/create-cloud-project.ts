import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { cloudProjectId, cloudProjectIdPattern } from "../google-parameters.ts";

/**
 * Creates a Google Cloud project (task HAL-17557). Google has no sign-in-free
 * way to do it, so the one step is `guided`: the user creates the project on
 * the console and pastes the project id back. Halonic can't check it.
 */
export const definition: StepperDefinition<Record<string, string | number>> = {
  id: "google.create-cloud-project",
  version: 1,
  service: "google",
  title: "Create a Google Cloud project",
  summary: "Makes a new project in the Google Cloud console and brings its project id back.",
  // A new, empty project costs nothing until something is switched on in it.
  risk: "routine",
  parameters: strictParameters({ projectId: cloudProjectId }),
  steps: [
    {
      kind: "guided",
      address: "https://console.cloud.google.com/projectcreate",
      instructions: [
        "Under **Project name**, type a name you will recognise, such as the one for {projectId}.",
        "Check **Location**: leave **No organization** unless your team told you which organization to use.",
        "Click **Edit** under the name and set the **Project ID** to {projectId}. If Google says it is taken, accept the id it suggests.",
        "Click **Create**, wait for the notification, then open the project from it.",
        "Google's guide: https://cloud.google.com/resource-manager/docs/creating-managing-projects",
      ],
      checkedOn: "from docs",
      result: { label: "the project id", pattern: cloudProjectIdPattern },
    },
  ],
  targets: (parameters) => [
    { service: "google", kind: "cloud project", name: `${parameters["projectId"]}` },
  ],
  preview: (parameters) => [
    `Opens the Google Cloud console, where you create the project ${parameters["projectId"]} by hand and paste its project id back. Halonic can't check it.`,
  ],
};
