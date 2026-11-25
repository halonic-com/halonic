import type { TextParameter } from "@halonicjs/action-steppers";

// Shared by the npm definitions. It sits next to src/npm/, not in it,
// because every file in a service folder is a definition.

/** An npm scope without the `@`, such as `acme`. */
export const npmScope: TextParameter = { kind: "text", pattern: /^[a-z0-9][a-z0-9-]{0,213}$/ };

/** The name of an npm package without its scope, such as `app`. */
export const npmPackage: TextParameter = { kind: "text", pattern: /^[a-z0-9][a-z0-9-]{0,213}$/ };

/**
 * The file name of a workflow in `.github/workflows/`, which is all npm asks for.
 * A parameter can't hold a `/`, so the folder is in the instructions instead.
 */
export const workflowFile: TextParameter = { kind: "text", pattern: /^[a-z0-9-]+\.ya?ml$/ };

/**
 * The GitHub environment the workflow's publish job names, or `none`. Optional
 * parameters would leave a `{environment}` gap in the guide, so it is always given.
 */
export const githubEnvironment: TextParameter = { kind: "text", pattern: /^[A-Za-z0-9_-]{1,100}$/ };
