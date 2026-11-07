import type { CheckContext } from "../lib/context.ts";
import type { Report } from "../lib/problems.ts";
import { checkDependencies } from "./dependencies.ts";
import { checkLayers } from "./layers.ts";
import { checkNames } from "./names.ts";
import { checkPackages } from "./packages.ts";

/** Every rule `pnpm check` runs, by name. */
export const rules: Readonly<Record<string, (context: CheckContext) => Report>> = {
  packages: checkPackages,
  layers: checkLayers,
  dependencies: checkDependencies,
  names: checkNames,
};
