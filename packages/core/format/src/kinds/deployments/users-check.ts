import type { KindCheckProblem } from "../../kind.ts";
import { checkRepeatedLimits } from "./limits-check.ts";
import { checkOrganisations } from "./organisations-check.ts";
import type { Deployments } from "./schema.ts";
import type { DeploymentUsers } from "./users.ts";

/**
 * Checks each deployment's `users` block beyond its schema: `meter: cloud`
 * names its product, no limit is given twice, organisations fit together,
 * and settings for another meter or a config meter with nothing to count
 * only warn, like Cloudflare settings on another host.
 */
export function checkUsers(file: Deployments): KindCheckProblem[] {
  return Object.entries(file.deployments).flatMap(([id, deployment]) =>
    deployment.users === undefined
      ? []
      : [
          ...checkCloudProduct(id, deployment.users),
          ...checkRepeatedLimits(
            deployment.users.config?.limits ?? [],
            ["deployments", id, "users", "config", "limits"],
            `Deployment "${id}"`,
          ),
          ...checkOrganisations(id, deployment.users),
          ...checkConfigCountsNothing(id, deployment.users),
          ...checkUnusedMeterSettings(id, deployment.users),
          ...checkExposedNeedsMany(id, deployment.users),
        ],
  );
}

/**
 * Only a `mode: many` deployment has end users, so an `exposed` list on an
 * owner deployment is refused rather than kept for later.
 */
function checkExposedNeedsMany(id: string, users: DeploymentUsers): KindCheckProblem[] {
  if (users.exposed === undefined || users.mode === "many") {
    return [];
  }
  return [
    {
      severity: "error",
      code: "users-exposed-needs-many",
      path: ["deployments", id, "users", "exposed"],
      message: `Deployment "${id}" uses mode "${users.mode}", so it can't expose workflows; use mode "many"`,
    },
  ];
}

/**
 * `meter: config` without a limit or an organisation's concurrency holds
 * nobody to anything, so it acts like `meter: none`; a warning says so.
 */
function checkConfigCountsNothing(id: string, users: DeploymentUsers): KindCheckProblem[] {
  if (users.meter !== "config") {
    return [];
  }
  const organisations = users.config?.organisations ?? [];
  const holdsSomething =
    (users.config?.limits ?? []).length > 0 ||
    organisations.some(
      (organisation) => organisation.limits.length > 0 || organisation.concurrency !== undefined,
    );
  if (holdsSomething) {
    return [];
  }
  return [
    {
      severity: "warning",
      code: "users-config-limits-missing",
      path:
        users.config === undefined
          ? ["deployments", id, "users", "meter"]
          : ["deployments", id, "users", "config", "limits"],
      message: `Deployment "${id}" uses meter "config" but has no limits, so it counts nothing, like meter "none"`,
    },
  ];
}

/** `meter: cloud` can't report usage without the product it reports to. */
function checkCloudProduct(id: string, users: DeploymentUsers): KindCheckProblem[] {
  if (users.meter !== "cloud" || users.cloud !== undefined) {
    return [];
  }
  return [
    {
      severity: "error",
      code: "users-cloud-product-missing",
      path: ["deployments", id, "users", "meter"],
      message: `Deployment "${id}" uses meter "cloud", so it needs users.cloud.product`,
    },
  ];
}

/**
 * Settings for a meter the deployment doesn't use are a warning, not an
 * error, so switching meters changes only `meter:` and the way back keeps
 * its settings.
 */
function checkUnusedMeterSettings(id: string, users: DeploymentUsers): KindCheckProblem[] {
  const unused = (["config", "cloud"] as const).filter(
    (meter) => users[meter] !== undefined && users.meter !== meter,
  );
  return unused.map((meter) => ({
    severity: "warning" as const,
    code: "users-meter-settings-unused",
    path: ["deployments", id, "users", meter],
    message: `Deployment "${id}" uses meter "${users.meter}", so its users.${meter} settings are not used`,
  }));
}
