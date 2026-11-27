import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";

/** Each part of the sign-in happens on the connection's own Paperclip, so the guide opens it once. */
const paperclipPage = "https://{host}/";

/**
 * Connects Studio to a Paperclip and tests a board sign-in (architecture
 * note on HAL-17491, row 15 and section 6.7). It reuses Studio's own
 * Paperclip sign-in through the `ServiceSignIn` port and sends no request of
 * its own. The approval page comes from the sign-in's answer on the
 * connection file's address; the `host` parameter only has to match that
 * file, so a request can't send the sign-in anywhere else. A test sign-in
 * starts only for a connection with no key and revokes the key it made
 * (Liam's conditions on HAL-17545).
 */
export const definition: StepperDefinition<Record<string, string | number>> = {
  id: "paperclip.connect-and-test",
  version: 1,
  service: "paperclip",
  title: "Connect Studio to Paperclip and test the sign-in",
  summary:
    "Signs this Studio in to a Paperclip as a board member, checks who is signed in, and can revoke a test key.",
  // Makes a board key, which can do everything the board can in Paperclip.
  risk: "admin",
  parameters: strictParameters({
    host: {
      kind: "text",
      pattern:
        /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?){1,8}$/,
    },
    // As Studio names a connection file (`agent-host.paperclip-key`).
    connection: { kind: "text", pattern: /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/ },
    mode: { kind: "choice", options: ["connect", "test"] },
  }),
  steps: [
    {
      kind: "sign-in",
      service: "paperclip",
      phase: "start",
      manual: {
        url: paperclipPage,
        instructions: [
          "In Studio, open **Settings › Connections**, find {connection} and click **Sign in**. Studio shows a short code and a 10-minute countdown.",
        ],
      },
    },
    {
      kind: "sign-in",
      service: "paperclip",
      phase: "approve",
      manual: {
        url: paperclipPage,
        instructions: [
          "On the approval page Studio opens on this Paperclip, sign in as a board member if it asks.",
          "Check the code matches the one Studio shows, then click **Approve**.",
        ],
      },
    },
    {
      kind: "sign-in",
      service: "paperclip",
      phase: "keep",
      manual: {
        url: paperclipPage,
        instructions: [
          "Keep Studio open until it says {connection} is connected. Closing it before then cancels the sign-in.",
        ],
      },
    },
    {
      kind: "sign-in",
      service: "paperclip",
      phase: "test",
      manual: {
        url: paperclipPage,
        instructions: [
          "In **Settings › Connections**, check which account {connection} is signed in as.",
          "For a test sign-in, click **Disconnect** there (**Studio › Settings › Connections › Disconnect**). It revokes the key, so Paperclip no longer accepts it.",
        ],
      },
    },
  ],
  targets: (parameters) => [
    { service: "paperclip", kind: "Paperclip", name: String(parameters["host"]) },
    { service: "paperclip", kind: "connection", name: String(parameters["connection"]) },
  ],
  preview: (parameters) => {
    const host = String(parameters["host"]);
    const isTest = parameters["mode"] === "test";
    return [
      `Starts a board sign-in to ${host} for the connection ${parameters["connection"]}, and shows its code for 10 minutes.`,
      `Opens the approval page on ${host}, where you check the code and click Approve.`,
      "Waits for your approval, then keeps the new board key in this computer's keychain.",
      isTest
        ? "Shows who the key signs in as, then revokes this test key and removes it from the keychain."
        : "Shows who the key signs in as.",
    ];
  },
};
