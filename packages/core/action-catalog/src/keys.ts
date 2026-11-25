import { catalogEntries } from "./catalog.generated.ts";

/** The key of every definition file `pnpm discover --fix` found: `github/upload-social-preview` for `src/github/upload-social-preview.ts`. */
export const shippedKeys: readonly string[] = Object.keys(catalogEntries).sort();
