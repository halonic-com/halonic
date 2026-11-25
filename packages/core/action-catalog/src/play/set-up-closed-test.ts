import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { playAppId, playDeveloperId } from "../google-parameters.ts";

/**
 * Sets up a closed testing track in the Play Console (task HAL-17557). The one
 * step is `guided`; the user pastes back the track's name, which isn't secret.
 */
export const definition: StepperDefinition<Record<string, string | number>> = {
  id: "play.set-up-closed-test",
  version: 1,
  service: "play",
  title: "Set up a closed test",
  summary: "Makes a closed testing track for an app and brings its name back.",
  // Nothing runs from Halonic; only the testers you list can install it, and the track can be paused.
  risk: "routine",
  parameters: strictParameters({ developerId: playDeveloperId, appId: playAppId }),
  steps: [
    {
      kind: "guided",
      address:
        "https://play.google.com/console/u/0/developers/{developerId}/app/{appId}/tracks/closed-testing",
      instructions: [
        "Click **Create track**, type a **Track name** and click **Create track**.",
        "Open the **Testers** tab, click **Create email list**, give the list a name, add the testers' email addresses and click **Save changes**, then tick the list.",
        "Open the **Countries / regions** tab, choose where the test is available and click **Add**.",
        "On the **Releases** tab, click **Create new release**, add the app bundle, write the release notes and click **Save**, then **Next** and **Save and publish**.",
        "Google's guide: https://support.google.com/googleplay/android-developer/answer/9845334",
      ],
      checkedOn: "from docs",
      result: { label: "the track name", pattern: "^[A-Za-z0-9 _-]{1,50}$" },
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
    `Opens the closed testing page of app ${parameters["appId"]} in the Play Console, where you set up a test track by hand and paste its name back. Halonic can't check it.`,
  ],
};
