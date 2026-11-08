import type { CheckContext } from "../lib/context.ts";
import type { Report } from "../lib/problems.ts";
import { checkAbsolutePaths } from "./absolute-paths.ts";
import { checkAgentsMd } from "./agents-md.ts";
import { checkDco } from "./dco.ts";
import { checkDependencies } from "./dependencies.ts";
import { checkFeatures } from "./features.ts";
import { checkFileSize } from "./file-size.ts";
import { inactiveChecks, inactiveRule } from "./inactive-checks.ts";
import { checkLayers } from "./layers.ts";
import { checkLockfile } from "./lockfile.ts";
import { checkNames } from "./names.ts";
import { checkPackages } from "./packages.ts";

/** Every rule `pnpm check` runs, by name. */
export const rules: Readonly<Record<string, (context: CheckContext) => Report>> = {
  packages: checkPackages,
  "agents-md": checkAgentsMd,
  layers: checkLayers,
  dependencies: checkDependencies,
  names: checkNames,
  features: checkFeatures,
  "file-size": checkFileSize,
  lockfile: checkLockfile,
  "absolute-paths": checkAbsolutePaths,
  dco: (context) => checkDco(context),
  ...Object.fromEntries(Object.keys(inactiveChecks).map((name) => [name, inactiveRule(name)])),
};
