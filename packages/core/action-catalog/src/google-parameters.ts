import type { TextParameter } from "@halonicjs/action-steppers";

// Shared by the Google Cloud and Google Play definitions. It sits next to src/google/,
// not in it, because every file in a service folder is a definition.

/** A Google Cloud project id: 6 to 30 lower-case letters, digits and hyphens, starting with a letter. */
export const cloudProjectIdPattern = "^[a-z][a-z0-9-]{5,29}$";

/** A Google Cloud project id, as Google allows it. */
export const cloudProjectId: TextParameter = {
  kind: "text",
  pattern: new RegExp(cloudProjectIdPattern),
};

/** The number in a Play Console developer account address. */
export const playDeveloperId: TextParameter = { kind: "text", pattern: /^\d{10,25}$/ };

/** The number in a Play Console app address. */
export const playAppId: TextParameter = { kind: "text", pattern: /^\d{10,25}$/ };
