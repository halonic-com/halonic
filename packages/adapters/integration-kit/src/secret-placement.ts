import type { AuthPlacement, SecretPlacement, Secrets } from "@halonicjs/ports";
import { IntegrationRefusedError } from "./integration/index.ts";
import { isLoopback } from "./local-address.ts";
import {
  type DeclaredPlacement,
  type DeclaredSecret,
  type DeclaredSignInPlacement,
  hostIn,
  type IntegrationPolicy,
} from "./policy.ts";

/** Checks that the secret is declared, isn't a client secret, and is placed as the sheet says. */
export function checkSecretPlacement(policy: IntegrationPolicy, placement: SecretPlacement): void {
  const declared = declaredSecret(policy, placement.secret);
  if (declared === undefined) {
    if (isClientSecret(policy, placement.secret)) {
      throw new IntegrationRefusedError(
        "secret-sign-in-only",
        `${policy.name}: the secret ${quoted(placement.secret)} is the client secret of a sign-in, which only Halonic's sign-in code sends`,
      );
    }
    throw new IntegrationRefusedError(
      "secret-not-declared",
      `${policy.name}: the secret ${quoted(placement.secret)} is not in its permission sheet`,
    );
  }
  if (!matchesSheet(placement, declared.placement)) {
    throw new IntegrationRefusedError(
      "placement-not-in-sheet",
      `${policy.name}: the secret ${quoted(placement.secret)} goes ${describe(declared.placement)} in its permission sheet, not ${describe(placement)}`,
    );
  }
}

/** Whether a sign-in names the secret as its client secret, by own key only. */
function isClientSecret(policy: IntegrationPolicy, secret: string): boolean {
  return Object.values(policy.signIns).some((signIn) => signIn.clientSecret?.name === secret);
}

/** Checks that the secret may go to this host, over this scheme. */
export function checkSecretHost(
  policy: IntegrationPolicy,
  placement: SecretPlacement,
  url: URL,
): void {
  const declared = declaredSecret(policy, placement.secret);
  if (declared === undefined || !hostIn(declared.hosts, url)) {
    throw new IntegrationRefusedError(
      "secret-not-allowed-for-host",
      `${policy.name}: the secret ${quoted(placement.secret)} may not go to ${url.host}`,
    );
  }
  if (!mayCarrySecret(url)) {
    throw new IntegrationRefusedError(
      "secret-over-plain-http",
      `${policy.name}: the secret ${quoted(placement.secret)} may not go over plain http to another machine (${url.host})`,
    );
  }
}

/** The sheet's entry for a secret, looked up by own key only, so `toString` is never a secret. */
function declaredSecret(policy: IntegrationPolicy, secret: string): DeclaredSecret | undefined {
  return Object.hasOwn(policy.secrets, secret) ? policy.secrets[secret] : undefined;
}

/**
 * Whether the code places the secret the way the sheet says. Otherwise it
 * could put a key in a field the service stores, such as a note title,
 * where the integration could read it back. Header names match ignoring
 * ASCII case, as HTTP does; a missing prefix and `""` send the same bytes;
 * form field names are case-sensitive. The placement comes from the
 * integration's code, so nothing in it is trusted to have the right type.
 */
export function matchesSheet(
  placement: AuthPlacement,
  sheet: DeclaredPlacement | DeclaredSignInPlacement,
): boolean {
  switch (sheet.as) {
    case "bearer":
      return placement.as === "bearer";
    case "header":
      return (
        placement.as === "header" &&
        typeof placement.header === "string" &&
        asciiLowerCase(placement.header) === asciiLowerCase(sheet.header) &&
        (placement.prefix ?? "") === (sheet.prefix ?? "")
      );
    case "form":
      return placement.as === "form" && placement.field === sheet.field;
  }
}

/**
 * Lower-cases `A` to `Z` only. `toLowerCase` would also turn the Kelvin
 * sign into `k`, so a header no service reads would pass as `x-api-key`.
 */
function asciiLowerCase(text: string): string {
  return text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}

/** A placement in words, for a refusal message. It never holds a value. */
export function describe(
  placement: DeclaredPlacement | DeclaredSignInPlacement | AuthPlacement,
): string {
  switch (placement.as) {
    case "bearer":
      return "as a bearer token";
    case "header": {
      const prefix = placement.prefix ?? "";
      return prefix === ""
        ? `in the header ${quoted(placement.header)}`
        : `in the header ${quoted(placement.header)} after ${quoted(prefix)}`;
    }
    case "form":
      return `in the form field ${quoted(placement.field)}`;
    default:
      return `as ${quoted((placement as { as: unknown }).as)}`;
  }
}

/**
 * Text from the integration's code, cut short and quoted, so it can't break
 * the message. It is cut by characters before quoting, so the cut never
 * falls inside an escape or a surrogate pair.
 */
export function quoted(text: unknown): string {
  const characters = Array.from(String(text));
  const shown =
    characters.length <= 50 ? characters.join("") : `${characters.slice(0, 50).join("")}…`;
  return JSON.stringify(shown);
}

/** A secret goes over `https`, or over plain `http` only to this machine. */
function mayCarrySecret(url: URL): boolean {
  return url.protocol === "https:" || isLoopback(url.hostname);
}

/**
 * Reads each secret's value once. The values never leave the kit. An
 * optional secret without a value gets no entry, so `place` leaves it out.
 */
export async function readSecrets(
  policy: IntegrationPolicy,
  secrets: Secrets,
  placements: readonly AuthPlacement[],
): Promise<Map<string, string>> {
  const values = new Map<string, string>();
  for (const { secret } of placements.filter((placement) => "secret" in placement)) {
    if (values.has(secret)) continue;
    const value = await secrets.get(secret);
    if (value === null || value === "") {
      // `checkPlacements` ran first, so the secret is declared.
      if (policy.secrets[secret]?.optional === true) continue;
      throw new IntegrationRefusedError(
        "secret-not-configured",
        `${policy.name}: the secret ${quoted(secret)} is not configured`,
      );
    }
    checkSecretLength(policy.name, secret, value);
    values.set(secret, value);
  }
  return values;
}

/**
 * The fewest UTF-8 bytes a secret value may have. The filter replaces every
 * copy of a value in what the integration sees, so a shorter one would
 * remove ordinary text, and where it was removed would give the value away.
 */
export const minSecretBytes = 8;

/**
 * @throws {IntegrationRefusedError} `secret-too-short` when `value` has fewer than {@link minSecretBytes} bytes
 */
export function checkSecretLength(integration: string, secret: string, value: string): void {
  if (new TextEncoder().encode(value).length >= minSecretBytes) return;
  throw new IntegrationRefusedError(
    "secret-too-short",
    `${integration}: the secret ${quoted(secret)} is shorter than ${minSecretBytes} bytes, too short to keep out of what the integration sees`,
  );
}

/**
 * Puts one secret into the headers or the form body, when it may go to this
 * hop's host. A secret that may not go to this hop is left out, which happens
 * after a redirect to another declared host.
 *
 * @returns the form body to send, which a `form` placement writes into
 */
export function placeSecret(
  policy: IntegrationPolicy,
  placement: SecretPlacement,
  value: string | undefined,
  url: URL,
  headers: Headers,
  form: URLSearchParams | undefined,
): URLSearchParams | undefined {
  const declared = policy.secrets[placement.secret];
  if (
    declared === undefined ||
    value === undefined ||
    !hostIn(declared.hosts, url) ||
    !mayCarrySecret(url)
  ) {
    return form;
  }
  switch (placement.as) {
    case "bearer":
      headers.set("authorization", `Bearer ${value}`);
      return form;
    case "header":
      headers.set(placement.header, `${placement.prefix ?? ""}${value}`);
      return form;
    case "form": {
      if (form === undefined) {
        throw new IntegrationRefusedError(
          "secret-needs-form-body",
          `${policy.name}: the secret ${quoted(placement.secret)} goes in a form field, so the body must be a form`,
        );
      }
      const written = new URLSearchParams(form);
      written.set(placement.field, value);
      return written;
    }
  }
}
