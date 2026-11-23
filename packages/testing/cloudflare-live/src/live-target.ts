import type { RunTarget } from "./run-checks.ts";
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

/** The variables the run check reads besides the Worker's address: the sign-in password. */
export const runTargetVariables = ["HALONIC_LIVE_WORKER_URL", "HALONIC_LIVE_PASSWORD"] as const;

/**
 * The deployed Worker the run check signs in to, read from the environment.
 *
 * @throws Error naming each missing variable, never a value
 */
export function liveRunTarget(env: Readonly<Record<string, string | undefined>>): RunTarget {
  const missing = runTargetVariables.filter((name) => (env[name] ?? "") === "");
  if (missing.length > 0) {
    throw new Error(`The run check has no Worker to sign in to. Missing: ${missing.join(", ")}.`);
  }
  const [baseUrl = "", password = ""] = runTargetVariables.map((name) => env[name]);
  return { baseUrl, password };
}
