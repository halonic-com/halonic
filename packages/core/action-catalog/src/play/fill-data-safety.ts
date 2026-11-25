import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { playAppId, playDeveloperId } from "../google-parameters.ts";

/**
 * Fills in an app's Data safety form in the Play Console (task HAL-17557).
 * The one step is `guided`; the answers are the user's to give, and Halonic
 * can't check them.
 */
export const definition: StepperDefinition<Record<string, string | number>> = {
  id: "play.fill-data-safety",
  version: 1,
  service: "play",
  title: "Fill in the Data safety form",
  summary: "Declares what data an app collects and shares, for its Google Play listing.",
  // Nothing runs from Halonic; the answers are the user's own, and the form can be edited again.
  risk: "routine",
  parameters: strictParameters({ developerId: playDeveloperId, appId: playAppId }),
  steps: [
    {
      kind: "guided",
      address:
        "https://play.google.com/console/u/0/developers/{developerId}/app/{appId}/app-content/data-privacy-security",
      instructions: [
        "Click **Start** (or **Manage** if the form already has answers), then read the overview and click **Next**.",
        "Under **Data collection and security**, answer whether the app collects or shares any of the required user data types.",
        "If it does, answer whether all of the data is encrypted in transit and whether users can ask for their data to be deleted.",
        "For each data type, choose whether it is **Collected** or **Shared**, why, and whether it is optional, then click **Save**.",
        "Under **Preview**, check the summary against what the app really does, then click **Save** and **Submit**.",
        "Google's guide: https://support.google.com/googleplay/android-developer/answer/10787469",
      ],
      checkedOn: "from docs",
    },
  ],
  targets: (parameters) => [
    {
      service: "play",
      kind: "app",
      name: `developer ${parameters["developerId"]}, app ${parameters["appId"]}`,
    },
  ],
  preview: (parameters) => [
    `Opens the Data safety form of app ${parameters["appId"]} in the Play Console, where you answer it by hand. Halonic can't check it.`,
  ],
};
