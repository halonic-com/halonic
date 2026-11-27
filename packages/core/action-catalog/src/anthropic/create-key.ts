import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { keepTheKeyLine, keyName } from "../provider-key-parameters.ts";

const keysPage = "https://console.anthropic.com/settings/keys";

/**
 * Creates an Anthropic API key (task HAL-17553, inventory cards row 1). The
 * key is made on Anthropic's own console and shown once there, so the one
 * step is `guided` with no paste-back: the key never enters Studio. Storing
 * it is the next step's job (`paperclip.set-secret@1`). Source: Anthropic's
 * API documentation (getting started, API keys) and the page's own labels.
 */
export const definition: StepperDefinition<Record<string, string | number>> = {
  id: "anthropic.create-key",
  version: 1,
  service: "anthropic",
  title: "Create an Anthropic API key",
  summary: "You create an API key on the Anthropic Console and copy it for the next step.",
  // A new key can spend the account's credit.
  risk: "admin",
  parameters: strictParameters({ keyName }),
  steps: [
    {
      kind: "guided",
      address: keysPage,
      instructions: [
        "Sign in to the Anthropic Console with your own account if the page asks.",
        "Click **Create Key**.",
        "Pick the workspace the key is for, and type {keyName} as its name.",
        "Click **Add** (or **Create Key**).",
        keepTheKeyLine,
      ],
      checkedOn: "from docs",
    },
  ],
  targets: (parameters) => [
    { service: "anthropic", kind: "API key", name: String(parameters["keyName"]) },
  ],
  preview: (parameters) => [
    `Opens the API keys page of the Anthropic Console, where you create the key ${parameters["keyName"]} and copy it. Halonic never sees it.`,
  ],
};
