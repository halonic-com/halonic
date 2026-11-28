import type { TextParameter } from "@halonicjs/action-steppers";

// Shared by the GitHub definitions. It sits next to src/github/, not in it,
// because every file in a service folder is a definition.

/**
 * A GitHub user or organisation name: 1 to 39 letters, digits and hyphens,
 * not starting with a hyphen. It lets a trailing hyphen through, which GitHub
 * refuses, because the shell's pattern subset has no groups to say so and a
 * route's owner must be one the shell can check (`action-send`'s `pattern.rs`).
 */
export const githubOwner: TextParameter = {
  kind: "text",
  pattern: /^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/,
};

/** A GitHub repository name. */
export const githubRepo: TextParameter = { kind: "text", pattern: /^[A-Za-z0-9._-]{1,100}$/ };

/**
 * The name of a repository `github.create-repository` makes: lower-case
 * letters, digits and hyphens, starting with a letter or digit. Narrower than
 * {@link githubRepo}, which must also read the dots, underscores and capitals
 * of repositories that already exist, so every new repository's name is also
 * a valid npm package, Paperclip project key and DNS label start.
 */
export const newGithubRepo: TextParameter = { kind: "text", pattern: /^[a-z0-9][a-z0-9-]{0,99}$/ };
