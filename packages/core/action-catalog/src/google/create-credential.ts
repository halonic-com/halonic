import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { cloudProjectId } from "../google-parameters.ts";
import { keepTheKeyLine, keyName } from "../provider-key-parameters.ts";

/**
 * Creates a restricted Google Cloud API key (task HAL-17553, inventory cards
 * row 1). Google shows the key on its console, so the one step is `guided`
 * with no paste-back: the key never enters Studio. The project is chosen in
 * the console's picker, because the page takes it only in a query, which a
 * guided address doesn't carry. Source: Google Cloud's documentation (manage
 * API keys) and the page's own labels.
 */
export const definition: StepperDefinition<Record<string, string | number>> = {
  id: "google.create-credential",
  version: 1,
  service: "google",
  title: "Create a Google Cloud API key",
  summary:
    "You create a restricted API key in a Google Cloud project and copy it for the next step.",
  // A new key can use, and spend on, the project's APIs.
  risk: "admin",
  parameters: strictParameters({ projectId: cloudProjectId, keyName }),
  steps: [
    {
      kind: "guided",
      address: "https://console.cloud.google.com/apis/credentials",
      instructions: [
        "Sign in to Google Cloud with your own account if the page asks.",
        "In the project picker at the top, choose the project {projectId}.",
        "Click **Create credentials**, then **API key**.",
        "In the dialog, click **Edit API key**, type {keyName} as its **Name**, and under **API restrictions** choose **Restrict key** and tick only the APIs this key is for.",
        "Click **Save**, then **Show key** on the key's row.",
        keepTheKeyLine,
      ],
      checkedOn: "from docs",
    },
  ],
  targets: (parameters) => [
    { service: "google", kind: "cloud project", name: String(parameters["projectId"]) },
    { service: "google", kind: "API key", name: String(parameters["keyName"]) },
  ],
  preview: (parameters) => [
    `Opens the credentials page of the Google Cloud console, where you create the restricted API key ${parameters["keyName"]} in ${parameters["projectId"]} and copy it. Halonic never sees it.`,
  ],
};
