import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";

/**
 * Adds credit to an OpenRouter account (inventory row 4). OpenRouter has no
 * API for buying credit and the card form is the user's alone, so the one
 * step is `guided`. Source: https://openrouter.ai/docs/faq (credits and
 * payments) and the page's own labels.
 */
export const definition: StepperDefinition<Record<string, string | number>> = {
  id: "openrouter.add-credit",
  version: 1,
  service: "openrouter",
  title: "Add credit to OpenRouter",
  summary: "Buys credit for your OpenRouter account so models can be used.",
  // Spends the user's money and a purchase can't be taken back.
  risk: "irreversible",
  parameters: strictParameters({}),
  steps: [
    {
      kind: "guided",
      address: "https://openrouter.ai/settings/credits",
      instructions: [
        "Sign in to OpenRouter with your own account if the page asks.",
        "Click **Add Credits**.",
        "Choose the amount you decide to spend and enter your payment details yourself; Halonic never sees them.",
        "Confirm the payment, then check that **Credits** shows the new balance.",
      ],
      // From the public docs; nobody has walked it on the live page yet.
      checkedOn: "2026-11-25",
    },
  ],
  targets: () => [{ service: "openrouter", kind: "page", name: "openrouter.ai/settings/credits" }],
  preview: () => [
    "Opens your OpenRouter credits page, where you buy credit and pay by hand. Halonic can't check it.",
  ],
};
