import type { KindCheckProblem } from "../../kind.ts";
import type { Deployments } from "./schema.ts";
import type { DeploymentUsers } from "./users.ts";

/**
 * Checks each deployment's `users` block beyond its schema: `meter: cloud`
 * names its product, no limit is given twice, and settings for another meter
 * only warn, like Cloudflare settings on another host.
 */
export function checkUsers(file: Deployments): KindCheckProblem[] {
  return Object.entries(file.deployments).flatMap(([id, deployment]) =>
    deployment.users === undefined
      ? []
      : [
          ...checkCloudProduct(id, deployment.users),
          ...checkRepeatedLimits(id, deployment.users),
          ...checkUnusedMeterSettings(id, deployment.users),
        ],
  );
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
 * Two limits on the same unit and period would leave it unclear which one
 * holds, so the second one is refused.
 */
function checkRepeatedLimits(id: string, users: DeploymentUsers): KindCheckProblem[] {
  const seen = new Set<string>();
  return (users.config?.limits ?? []).flatMap((limit, index) => {
    const key = `${limit.unit} per ${limit.period}`;
    if (!seen.has(key)) {
      seen.add(key);
      return [];
    }
    return [
      {
        severity: "error" as const,
        code: "users-limit-repeated",
        path: ["deployments", id, "users", "config", "limits", index],
        message: `Deployment "${id}" already has a limit on ${key}`,
      },
    ];
  });
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
