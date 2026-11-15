import type { WebhookTarget } from "./webhook-checks.ts";

/** The variables that say which deployed Worker the live suites call. The fixture that deploys it sets them. */
export const targetVariables = [
  "HALONIC_LIVE_WORKER_URL",
  "HALONIC_LIVE_WEBHOOK_ADDRESS",
  "HALONIC_LIVE_WEBHOOK_SECRET",
] as const;

/**
 * The deployed Worker the live suites call, read from the environment.
 *
 * @throws Error naming each missing variable, never a value
 */
export function liveWebhookTarget(
  env: Readonly<Record<string, string | undefined>>,
): WebhookTarget {
  const missing = targetVariables.filter((name) => (env[name] ?? "") === "");
  if (missing.length > 0) {
    throw new Error(`The live suites have no Worker to call. Missing: ${missing.join(", ")}.`);
  }
  const [baseUrl = "", address = "", secret = ""] = targetVariables.map((name) => env[name]);
  return { baseUrl, address, secret };
}
