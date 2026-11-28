import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import {
  bindableVariable,
  paperclipCompany,
  paperclipHost,
  secretName,
  secretsPage,
} from "../paperclip-parameters.ts";

/**
 * Gives one named agent access to one named Paperclip secret, as one
 * environment variable (task HAL-17553, architecture note row C1). Binding
 * hands the agent the secret's value, so it is `irreversible`: the agent may
 * have used the value before access is removed. It stays `guided` until the
 * Paperclip admin key of section 6.8 is decided (HAL-20274); the API form is
 * HAL-20275. Labels from the **Agent access** part of Paperclip's secret page.
 */
export const definition: StepperDefinition<Record<string, string | number>> = {
  id: "paperclip.bind-secret",
  version: 1,
  service: "paperclip",
  title: "Give an agent a Paperclip secret",
  summary:
    "You give one agent one secret as an environment variable, on Paperclip's own Secrets page.",
  // The agent can read the value from its next run; removing access later doesn't take it back.
  risk: "irreversible",
  parameters: strictParameters({
    host: paperclipHost,
    company: paperclipCompany,
    name: secretName,
    agent: { kind: "text", pattern: /^[A-Za-z][A-Za-z0-9._-]{0,47}$/ },
    variable: bindableVariable,
  }),
  steps: [
    {
      kind: "guided",
      address: secretsPage,
      instructions: [
        "Sign in to this Paperclip as a board member if the page asks.",
        "Open the secret {name}.",
        "Under **Agent access**, choose {agent} as the **Agent** and type {variable} as the **Env var**.",
        "Check the agent's name once more: {agent} can read the value from its next run. Then click **Add**.",
      ],
      checkedOn: "2026-11-27",
    },
  ],
  targets: (parameters) => [
    { service: "paperclip", kind: "Paperclip", name: String(parameters["host"]) },
    { service: "paperclip", kind: "secret", name: String(parameters["name"]) },
    { service: "paperclip", kind: "agent", name: String(parameters["agent"]) },
  ],
  preview: (parameters) => [
    `Opens the Secrets page of ${parameters["company"]} on ${parameters["host"]}, where you give the agent ${parameters["agent"]} the secret ${parameters["name"]} as ${parameters["variable"]}. The agent can read its value from then on.`,
  ],
};
