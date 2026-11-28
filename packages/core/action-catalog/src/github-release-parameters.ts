import type { TextParameter } from "@halonicjs/action-steppers";

// Shared by the GitHub release definitions. It sits next to src/github/, not
// in it, because every file in a service folder is a definition, and apart
// from github-parameters.ts so the older definitions' source hashes don't change.

/** A full 40-character commit sha in lower case, as GitHub answers it. */
export const commitSha: TextParameter = { kind: "text", pattern: /^[0-9a-f]{40}$/ };

/** The release card the request comes from, such as `ACME-12`; only the preview shows it. */
export const releaseCard: TextParameter = {
  kind: "text",
  pattern: /^[A-Z][A-Z0-9]{0,9}-[1-9][0-9]{0,6}$/,
};
