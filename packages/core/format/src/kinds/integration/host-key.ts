import type { IntegrationHost, IntegrationSecretHost } from "./schema.ts";

/**
 * A host as one text, to compare: `api.example.com`, or `fromSetting url`.
 * A secret or a sign-in names a `{ fromSetting }` host by its setting alone,
 * so the class isn't part of it.
 */
export function hostKey(host: IntegrationHost | IntegrationSecretHost): string {
  return typeof host === "string" ? host : `fromSetting ${host.fromSetting}`;
}
