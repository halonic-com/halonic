import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { keepTheKeyLine, keyName } from "../provider-key-parameters.ts";

/**
 * Creates an OpenRouter API key (task HAL-17553, inventory cards row 1). The
 * key is made on OpenRouter's own page and shown once there, so the one step
 * is `guided` with no paste-back: the key never enters Studio. Storing it is
 * the next step's job (`paperclip.set-secret@1`). Source:
 * https://openrouter.ai/docs (API keys) and the page's own labels.
 */
export const definition: StepperDefinition<Record<string, string | number>> = {
  id: "openrouter.create-key",
  version: 1,
  service: "openrouter",
  title: "Create an OpenRouter API key",
  summary: "You create an API key on OpenRouter and copy it for the next step.",
  // A new key can spend the account's credit.
  risk: "admin",
  parameters: strictParameters({ keyName }),
  steps: [
    {
      kind: "guided",
      address: "https://openrouter.ai/settings/keys",
      instructions: [
        "Sign in to OpenRouter with your own account if the page asks.",
        "Click **Create API Key**.",
        "Type {keyName} as its **Name**. Set a **Credit limit** if you want one.",
        "Click **Create**.",
        keepTheKeyLine,
      ],
      checkedOn: "from docs",
    },
  ],
  targets: (parameters) => [
    { service: "openrouter", kind: "API key", name: String(parameters["keyName"]) },
  ],
  preview: (parameters) => [
    `Opens your OpenRouter API keys page, where you create the key ${parameters["keyName"]} and copy it. Halonic never sees it.`,
  ],
};
