import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { cloudProjectId } from "../google-parameters.ts";

/**
 * Sets up the OAuth consent screen of a Google Cloud project (task HAL-17557).
 * The one step is `guided`. If the user goes on to create an OAuth client, its
 * secret goes into Halonic's secret dialog, never into a result field.
 */
export const definition: StepperDefinition<Record<string, string | number>> = {
  id: "google.configure-oauth-consent",
  version: 1,
  service: "google",
  title: "Configure the OAuth consent screen",
  summary: "Fills in the consent screen people see when they sign in with Google.",
  // Visible to the people who sign in, and reversible on the same page.
  risk: "routine",
  parameters: strictParameters({ projectId: cloudProjectId }),
  steps: [
    {
      kind: "guided",
      address: "https://console.cloud.google.com/auth/overview?project={projectId}",
      instructions: [
        "Check that the project picker at the top shows {projectId}. If this is your first time here, click **Get started**.",
        "Under **App information**, type the **App name** and choose your **User support email**, then click **Next**.",
        "Under **Audience**, choose **Internal** if everyone who signs in is in your Google Workspace organization, otherwise **External**, then click **Next**.",
        "Under **Contact information**, type an email address for project notices, then click **Next**.",
        "Tick **I agree to the Google API Services: User Data Policy** and click **Continue**, then **Create**.",
        "If you go on to create an OAuth client, never paste its client secret on the card: Halonic asks for it in its own secret dialog.",
        "Google's guide: https://support.google.com/cloud/answer/15544987",
      ],
      checkedOn: "from docs",
    },
  ],
  targets: (parameters) => [
    { service: "google", kind: "cloud project", name: `${parameters["projectId"]}` },
  ],
  preview: (parameters) => [
    `Opens the OAuth consent screen of the Google Cloud project ${parameters["projectId"]}, where you fill it in by hand. Halonic can't check it.`,
  ],
};
