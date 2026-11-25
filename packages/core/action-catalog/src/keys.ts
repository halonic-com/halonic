import { catalogEntries } from "./catalog.generated.ts";

// The catalog lands in two steps, because CI runs the policy rules from the
// base commit's copy (docs/guides/checks.md): this package first, with no core
// dependency, then the definitions and their types from
// @halonicjs/action-steppers (HAL-17561).

/** The key of every definition file `pnpm discover --fix` found: `github/upload-social-preview` for `src/github/upload-social-preview.ts`. */
export const shippedKeys: readonly string[] = Object.keys(catalogEntries).sort();
