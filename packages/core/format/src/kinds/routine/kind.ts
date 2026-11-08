import type { FileKind } from "../../kind.ts";
import { isMap, renameKey } from "../../shared/legacy-keys.ts";
import { Routine } from "./schema.ts";

/**
 * `workflows/routines/<id>.routine.yaml`, at the root or in a hub. Checking
 * the cron text and time zone is `@halonicjs/routines`' job, which sits
 * above this package.
 */
export const routineKind: FileKind<Routine> = {
  name: "routine",
  about: "When a workflow or an agent runs on its own: a schedule, an interval, a signal or mail.",
  syntax: "yaml",
  schema: Routine,
  places: [{ scope: "workspace-and-hub", folder: "workflows/routines", name: "<id>.routine.yaml" }],
  idFromPlace: "fallback",
  upgradeKeys: upgradeRoutineKeys,
};

/** Workflows were called flows and hubs projects: `run.flow` and `run.project` still load. */
function upgradeRoutineKeys(data: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const run = data["run"];
  if (!isMap(run)) {
    return { ...data };
  }
  const upgradedRun = renameKey(renameKey(run, "flow", "workflow"), "project", "hub");
  return { ...data, run: upgradedRun };
}
