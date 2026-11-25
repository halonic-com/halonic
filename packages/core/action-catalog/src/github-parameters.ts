import type { TextParameter } from "@halonicjs/action-steppers";

// Shared by the GitHub definitions. It sits next to src/github/, not in it,
// because every file in a service folder is a definition.

/** A GitHub user or organisation name, as GitHub allows it. */
export const githubOwner: TextParameter = {
  kind: "text",
  pattern: /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/,
};

/** A GitHub repository name. */
export const githubRepo: TextParameter = { kind: "text", pattern: /^[A-Za-z0-9._-]{1,100}$/ };
