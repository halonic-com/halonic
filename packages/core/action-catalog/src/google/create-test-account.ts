import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";

/**
 * Creates a Google account for testing (inventory row 4). Sign-up needs a
 * phone check no API covers, so the one step is `guided`. The user pastes
 * back the new address only, never a password or a code. Source:
 * https://support.google.com/accounts/answer/27441
 */
export const definition: StepperDefinition<Record<string, string | number>> = {
  id: "google.create-test-account",
  version: 1,
  service: "google",
  title: "Create a Google account for testing",
  summary: "Signs up a new Google account you can use to try Halonic.",
  // Opens an account in the user's name that has to be kept up.
  risk: "admin",
  parameters: strictParameters({}),
  steps: [
    {
      kind: "guided",
      address: "https://accounts.google.com/signup",
      instructions: [
        "Fill in the name and choose **Next**; use a test name such as `Acme Test`, not a real person's.",
        "Enter a birthday and choose **Next**.",
        "Choose or type the new address, then choose **Next**.",
        "Create a password and keep it in your password manager; never paste it here.",
        "If Google asks to verify your phone, enter your number and the code Google sends you yourself.",
        "Finish with **I agree**, then check that you are signed in to the new account.",
      ],
      // From the public docs; nobody has walked it on the live page yet.
      checkedOn: "2026-11-25",
      result: { label: "the new account's address", pattern: "^[a-z0-9.]{6,30}@gmail\\.com$" },
    },
  ],
  targets: () => [{ service: "google", kind: "page", name: "accounts.google.com/signup" }],
  preview: () => [
    "Opens Google's sign-up page, where you create a test account and pass the phone check by hand. Halonic can't check it.",
  ],
};
