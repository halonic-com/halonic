import type { FileKind, KindCheckProblem } from "../../kind.ts";
import { isMap, renameKey } from "../../shared/legacy-keys.ts";
import { checkReservedSecretName, checkSecretName } from "../../shared/secret-name.ts";
import { Routine } from "./schema.ts";
import { WEBHOOK_REFUSED_HEADERS } from "./webhook-headers.ts";

/**
 * `workflows/routines/<id>.routine.yaml`, at the root or in a hub. Checking
 * the cron text and time zone is `@halonicjs/routines`' job, which sits
 * above this package.
 */
export const routineKind: FileKind<Routine> = {
  name: "routine",
  about:
    "When a workflow or an agent runs on its own: a schedule, an interval, a signal, mail or a webhook.",
  syntax: "yaml",
  schema: Routine,
  places: [{ scope: "workspace-and-hub", folder: "workflows/routines", name: "<id>.routine.yaml" }],
  idFromPlace: "fallback",
  upgradeKeys: upgradeRoutineKeys,
  check: checkRoutine,
};

/*
 * The words are the team's, as the connector's are: a small wording on a
 * check already approved (HAL-14566).
 */
const reservedNameMessage =
  "This secret name belongs to Halonic or to a plugin, so a webhook can't use it. Store the value under a name of your own, such as acme-hook.";

/**
 * A webhook's secret is named in the file, so a bad name, a pasted key or a
 * name that belongs to Halonic or a plugin is caught here, and so is a
 * header the run must not read.
 */
function checkRoutine(routine: Routine): KindCheckProblem[] {
  const { trigger } = routine;
  if (!("webhook" in trigger)) {
    return [];
  }
  const { secret } = trigger.webhook;
  const secretPath = ["trigger", "webhook", "secret"];
  const problem =
    checkSecretName(secret, secretPath) ??
    checkReservedSecretName(secret, secretPath, reservedNameMessage);
  const problems: KindCheckProblem[] = problem === undefined ? [] : [problem];
  const seen = new Set<string>();
  trigger.webhook.headers.forEach((header, index) => {
    const path = ["trigger", "webhook", "headers", index];
    if (WEBHOOK_REFUSED_HEADERS.includes(header)) {
      problems.push({
        severity: "error",
        code: "webhook-header-refused",
        path,
        message: `A run can't read the "${header}" header: it carries a credential or is used to verify the request. Remove it.`,
      });
    } else if (seen.has(header)) {
      problems.push({
        severity: "error",
        code: "webhook-header-duplicate",
        path,
        message: `The "${header}" header is listed twice. List each header once.`,
      });
    }
    seen.add(header);
  });
  return problems;
}

/** Workflows were called flows and hubs projects: `run.flow` and `run.project` still load. */
function upgradeRoutineKeys(data: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const run = data["run"];
  if (!isMap(run)) {
    return { ...data };
  }
  const upgradedRun = renameKey(renameKey(run, "flow", "workflow"), "project", "hub");
  return { ...data, run: upgradedRun };
}
