import type { CheckContext } from "../lib/context.ts";
import type { Report } from "../lib/problems.ts";
import { checkAbsolutePaths } from "./absolute-paths.ts";
import { checkAgentsMd } from "./agents-md.ts";
import { checkDependencies } from "./dependencies.ts";
import { checkFeatures } from "./features.ts";
import { checkFileSize } from "./file-size.ts";
import { checkLayers } from "./layers.ts";
import { checkLockfile } from "./lockfile.ts";
import { checkNames } from "./names.ts";
import { checkPackages } from "./packages.ts";
import { phaseOneSlots, slotRule } from "./phase-one-slots.ts";

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
  ...Object.fromEntries(Object.keys(phaseOneSlots).map((name) => [name, slotRule(name)])),
};
