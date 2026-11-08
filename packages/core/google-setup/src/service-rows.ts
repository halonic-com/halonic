import { enableApiUrl } from "./console-links.ts";
import type { SetupService } from "./setup-input.ts";
import type { ApiRow, ScopeRow } from "./setup-step.ts";

/**
 * Joins the services' `googleApis` into one row per API, in the order the
 * services list them. When two sheets name the same API differently, the
 * first name wins.
 *
 * @throws RangeError when an API isn't a Google API host.
 */
export function mergeApis(
  services: readonly SetupService[],
  projectId: string | undefined,
): ApiRow[] {
  const rows = new Map<string, { api: string; name: string; neededBy: string[] }>();
  for (const service of services) {
    for (const { api, name } of service.googleApis) {
      const row = rows.get(api) ?? { api, name, neededBy: [] };
      if (!row.neededBy.includes(service.id)) {
        row.neededBy.push(service.id);
      }
      rows.set(api, row);
    }
  }
  return [...rows.values()].map((row) => ({
    ...row,
    enableUrl: enableApiUrl(row.api, projectId),
  }));
}

/**
 * Joins the services' `googleScopes` into one row per scope, in the order the
 * services list them. Each service keeps its own reason, because two sheets
 * can need the same scope for different things.
 */
export function mergeScopes(services: readonly SetupService[]): ScopeRow[] {
  const rows = new Map<
    string,
    { scope: string; restricted: boolean; neededBy: { service: string; reason: string }[] }
  >();
  for (const service of services) {
    for (const { scope, reason, restricted = false } of service.googleScopes) {
      const row = rows.get(scope) ?? { scope, restricted: false, neededBy: [] };
      row.restricted ||= restricted;
      // A sheet that lists a scope twice still gives one reason per service.
      if (!row.neededBy.some((need) => need.service === service.id)) {
        row.neededBy.push({ service: service.id, reason });
      }
      rows.set(scope, row);
    }
  }
  return [...rows.values()];
}
