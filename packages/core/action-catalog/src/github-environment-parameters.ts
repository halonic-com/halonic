import type { IntegerParameter, TextParameter } from "@halonicjs/action-steppers";

// Shared by the GitHub environment and deployment definitions. It sits next
// to src/github/, not in it, because every file in a service folder is a
// definition, and apart from github-parameters.ts so the older definitions'
// source hashes don't change.

/**
 * A GitHub environment name, such as `production`. GitHub allows more, such
 * as spaces, but a name is one path segment the shell sends as it is, so
 * only characters that need no escaping pass.
 */
export const githubEnvironment: TextParameter = {
  kind: "text",
  pattern: /^[A-Za-z0-9._-]{1,255}$/,
};

/** A GitHub numeric id, such as a workflow run's or an environment's. */
export const githubId: IntegerParameter = { kind: "integer", min: 1, max: 999_999_999_999 };
