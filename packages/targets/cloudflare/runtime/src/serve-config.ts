import type { ServerConfig } from "@halonicjs/host-server";
import { ConfigurationError } from "./env.ts";

/** The Worker variable that lists the `Host` names the API answers to, separated by commas. */
export const allowedHostsVariable = "HALONIC_ALLOWED_HOSTS";

/** The Worker variable with the deployment's id in `deployments.yaml`, so each deployment has its own request count. */
export const deploymentIdVariable = "HALONIC_DEPLOYMENT_ID";

/** The Worker variable with `limits.dailyRequests`. Without it nothing is capped. */
export const dailyRequestsVariable = "HALONIC_DAILY_REQUESTS";

/** The version `GET /api/hello` reports, and the oldest Android app this Worker works with. */
const serverVersion = "0.1.0";

/** The most bytes a request body may have: 1 MiB, far above any webhook or chat turn. */
export const maxBodyBytes = 1_048_576;

function variable(env: object, name: string): string | undefined {
  const value = (env as Record<string, unknown>)[name];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * What the Worker decides about its API from its plain variables: none of them
 * is a secret. The `Host` names are the only ones the API answers to, so the
 * preview addresses Cloudflare makes for each version, and every name nobody
 * listed, get no API.
 *
 * @throws ConfigurationError when the host names or the deployment id are missing, or the daily ceiling isn't a whole number above zero; it names the variable, never its value
 *
 * @example
 * serverConfigOf({ HALONIC_ALLOWED_HOSTS: "halonic.example.com", HALONIC_DEPLOYMENT_ID: "main" });
 */
export function serverConfigOf(env: object): ServerConfig {
  const hosts = variable(env, allowedHostsVariable)
    ?.split(",")
    .map((name) => name.trim())
    .filter((name) => name !== "");
  const deploymentId = variable(env, deploymentIdVariable);
  const missing: string[] = [];
  if (hosts === undefined || hosts.length === 0) missing.push(allowedHostsVariable);
  if (deploymentId === undefined) missing.push(deploymentIdVariable);

  const daily = variable(env, dailyRequestsVariable);
  const dailyRequests = daily === undefined ? undefined : Number(daily);
  if (dailyRequests !== undefined && !(Number.isInteger(dailyRequests) && dailyRequests > 0)) {
    missing.push(dailyRequestsVariable);
  }
  if (missing.length > 0 || hosts === undefined || deploymentId === undefined) {
    throw new ConfigurationError(missing);
  }
  return {
    deploymentId,
    version: serverVersion,
    minAppVersion: serverVersion,
    allowedHosts: hosts,
    maxBodyBytes,
    ...(dailyRequests === undefined ? {} : { dailyRequests }),
  };
}
