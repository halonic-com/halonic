import type { CheckContext } from "../lib/context.ts";
import type { Report } from "../lib/problems.ts";

/** Every rule `pnpm check` runs, by name. */
export const rules: Readonly<Record<string, (context: CheckContext) => Report>> = {};
