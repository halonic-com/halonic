import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import {
  paperclipCompany,
  paperclipHost,
  secretName,
  secretsPage,
} from "../paperclip-parameters.ts";

/**
 * Creates or rotates one named secret in Paperclip Secrets by hand (task
 * HAL-17553, architecture note row C1). The user pastes the value on
 * Paperclip's own Secrets page, so it never enters a request, a parameter, a
 * record or an agent. It stays `guided` until the Paperclip admin key of
 * section 6.8 is decided (HAL-20274); the API form, with the value from the
 * native dialog, is HAL-20275. Labels from Paperclip's Secrets page.
 */
export const definition: StepperDefinition<Record<string, string | number>> = {
  id: "paperclip.set-secret",
  version: 1,
  service: "paperclip",
  title: "Store a key in Paperclip Secrets",
  summary: "You paste a key or token into one named secret on Paperclip's own Secrets page.",
  // Agents bound to the secret use the new value from their next run.
  risk: "admin",
  parameters: strictParameters({
    host: paperclipHost,
    company: paperclipCompany,
    name: secretName,
  }),
  steps: [
    {
      kind: "guided",
      address: secretsPage,
      instructions: [
        "Sign in to this Paperclip as a board member if the page asks.",
        "If {name} is listed, open it and click **Update value**, paste the value into **New value**, and click **Update value**.",
        "If it isn't listed, click **New secret**. Under **Who provides the value?** choose **Organization**, then **Managed value**. Type {name} as the **Name**, paste the value into **Value**, and click **Create secret**.",
        "Paste the value only into that field, never into a chat, a task or a request.",
      ],
      checkedOn: "2026-11-27",
    },
  ],
  targets: (parameters) => [
    { service: "paperclip", kind: "Paperclip", name: String(parameters["host"]) },
    { service: "paperclip", kind: "secret", name: String(parameters["name"]) },
  ],
  preview: (parameters) => [
    `Opens the Secrets page of ${parameters["company"]} on ${parameters["host"]}, where you paste the value of ${parameters["name"]} yourself. Halonic never sees it.`,
  ],
};
