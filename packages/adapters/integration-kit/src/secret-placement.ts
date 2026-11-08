import type { SecretPlacement, Secrets } from "@halonicjs/ports";
import { isLoopback } from "./local-address.ts";
import { hostIn, type IntegrationPolicy } from "./policy.ts";
import { IntegrationRefusedError } from "./refused.ts";

/** Checks every placement against the sheet before anything is sent. */
export function checkPlacements(
  policy: IntegrationPolicy,
  placements: readonly SecretPlacement[],
  url: URL,
): void {
  for (const placement of placements) {
    const declared = Object.hasOwn(policy.secrets, placement.secret)
      ? policy.secrets[placement.secret]
      : undefined;
    if (declared === undefined) {
      throw new IntegrationRefusedError(
        "secret-not-declared",
        `${policy.name}: the secret "${placement.secret}" is not in its permission sheet`,
      );
    }
    if (!hostIn(declared.hosts, url)) {
      throw new IntegrationRefusedError(
        "secret-not-allowed-for-host",
        `${policy.name}: the secret "${placement.secret}" may not go to ${url.host}`,
      );
    }
    if (!mayCarrySecret(url)) {
      throw new IntegrationRefusedError(
        "secret-over-plain-http",
        `${policy.name}: the secret "${placement.secret}" may not go over plain http to another machine (${url.host})`,
      );
    }
  }
}

/** A secret goes over `https`, or over plain `http` only to this machine. */
function mayCarrySecret(url: URL): boolean {
  return url.protocol === "https:" || isLoopback(url.hostname);
}

/** Reads each secret's value once. The values never leave the kit. */
export async function readSecrets(
  policy: IntegrationPolicy,
  secrets: Secrets,
  placements: readonly SecretPlacement[],
): Promise<Map<string, string>> {
  const values = new Map<string, string>();
  for (const { secret } of placements) {
    if (values.has(secret)) continue;
    const value = await secrets.get(secret);
    if (value === null || value === "") {
      throw new IntegrationRefusedError(
        "secret-not-configured",
        `${policy.name}: the secret "${secret}" is not configured`,
      );
    }
    values.set(secret, value);
  }
  return values;
}

/**
 * Puts the secrets allowed for this hop's host into the headers and the form
 * body. A placement whose secret may not go to this hop is left out, which
 * happens after a redirect to another declared host.
 *
 * @returns the form body to send, when a placement wrote into it
 */
export function place(
  policy: IntegrationPolicy,
  placements: readonly SecretPlacement[],
  values: ReadonlyMap<string, string>,
  url: URL,
  headers: Headers,
  form: URLSearchParams | undefined,
): URLSearchParams | undefined {
  let body = form;
  for (const placement of placements) {
    const declared = policy.secrets[placement.secret];
    const value = values.get(placement.secret);
    if (
      declared === undefined ||
      value === undefined ||
      !hostIn(declared.hosts, url) ||
      !mayCarrySecret(url)
    )
      continue;
    switch (placement.as) {
      case "bearer":
        headers.set("authorization", `Bearer ${value}`);
        break;
      case "header":
        headers.set(placement.header, `${placement.prefix ?? ""}${value}`);
        break;
      case "form":
        if (body === undefined) {
          throw new IntegrationRefusedError(
            "secret-needs-form-body",
            `${policy.name}: the secret "${placement.secret}" goes in a form field, so the body must be a form`,
          );
        }
        body = new URLSearchParams(body);
        body.set(placement.field, value);
        break;
    }
  }
  return body;
}
