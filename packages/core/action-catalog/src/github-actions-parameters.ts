import type { TextParameter } from "@halonicjs/action-steppers";

// Shared by the GitHub Actions variable and secret definitions. It sits next
// to src/github/, not in it, because every file in a service folder is a
// definition, and apart from github-parameters.ts so the older definitions'
// source hashes don't change.

/**
 * An Actions variable or secret name: letters, digits and `_`, not starting
 * with a digit. GitHub also refuses a `GITHUB_` prefix, with a 422; the
 * shell's pattern subset has no groups to say so.
 */
export const actionsName: TextParameter = {
  kind: "text",
  pattern: /^[A-Za-z_][A-Za-z0-9_]{0,99}$/,
};

/**
 * An Actions variable's value: one line of printable ASCII, at most 1,000
 * characters, so it fits the shell's longest matched value. Never a secret:
 * a secret is set by hand with `github.set-actions-secret`.
 */
export const variableValue: TextParameter = { kind: "text", pattern: /^[ -~]{1,1000}$/ };
