import type { SecretPlacement, Secrets } from "@halonicjs/ports";
import { IntegrationRefusedError } from "./integration/index.ts";
import { isLoopback } from "./local-address.ts";
import {
  type DeclaredPlacement,
  type DeclaredSecret,
  hostIn,
  type IntegrationPolicy,
} from "./policy.ts";

/**
 * Copies the placements the integration's code gave into frozen objects of
 * text fields, reading each field once. The kit checks and places only
 * these copies: the code keeps its own objects and could change them, or
 * give a getter, after the check and before the secret is placed. A field
 * that isn't text is refused here, because an object could turn into other
 * text each time it is read.
 */
export function copyPlacements(
  policy: IntegrationPolicy,
  placements: readonly unknown[],
): readonly SecretPlacement[] {
  return Object.freeze(placements.map((placement) => copyPlacement(policy, placement)));
}

/** A placement as the integration's code may give it, with nothing trusted. */
interface GivenPlacement {
  readonly secret?: unknown;
  readonly as?: unknown;
  readonly header?: unknown;
  readonly prefix?: unknown;
  readonly field?: unknown;
}

function copyPlacement(policy: IntegrationPolicy, placement: unknown): SecretPlacement {
  if (typeof placement !== "object" || placement === null) {
    throw notText(policy, "a secret placement");
  }
  const given: GivenPlacement = placement;
  const secret = given.secret;
  const as = given.as;
  if (typeof secret !== "string") throw notText(policy, "the secret's name");
  if (typeof as !== "string") throw notText(policy, `the "as" of the secret "${secret}"`);
  const copy: Record<string, string> = { secret, as };
  for (const key of ["header", "prefix", "field"] as const) {
    const value = given[key];
    if (value === undefined) continue;
    if (typeof value !== "string") throw notText(policy, `the "${key}" of the secret "${secret}"`);
    copy[key] = value;
  }
  // Whether the fields fit together is for `checkPlacements` to say.
  return Object.freeze(copy) as unknown as SecretPlacement;
}

function notText(policy: IntegrationPolicy, what: string): IntegrationRefusedError {
  return new IntegrationRefusedError(
    "placement-not-in-sheet",
    `${policy.name}: ${what} in a secret placement is not text`,
  );
}

/**
 * Checks every placement against the sheet before a secret value is read.
 * Give it the copies from {@link copyPlacements}, never the code's own
 * objects. Where the secret may go is for {@link checkPlacementHosts}.
 */
export function checkPlacements(
  policy: IntegrationPolicy,
  placements: readonly SecretPlacement[],
): void {
  for (const placement of placements) {
    const declared = declaredSecret(policy, placement.secret);
    if (declared === undefined) {
      throw new IntegrationRefusedError(
        "secret-not-declared",
        `${policy.name}: the secret "${placement.secret}" is not in its permission sheet`,
      );
    }
    if (!matchesSheet(placement, declared.placement)) {
      throw new IntegrationRefusedError(
        "placement-not-in-sheet",
        `${policy.name}: the secret "${placement.secret}" goes ${describe(declared.placement)} in its permission sheet, not ${describe(placement)}`,
      );
    }
  }
}

/**
 * Checks that every placed secret may go to the request's first host, once
 * the URL is parsed. {@link checkPlacements} has already run, so every
 * secret is declared.
 */
export function checkPlacementHosts(
  policy: IntegrationPolicy,
  placements: readonly SecretPlacement[],
  url: URL,
): void {
  for (const placement of placements) {
    const declared = declaredSecret(policy, placement.secret);
    if (declared === undefined || !hostIn(declared.hosts, url)) {
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
function matchesSheet(placement: SecretPlacement, sheet: DeclaredPlacement): boolean {
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
function describe(placement: DeclaredPlacement | SecretPlacement): string {
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
function quoted(text: unknown): string {
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
  placements: readonly SecretPlacement[],
): Promise<Map<string, string>> {
  const values = new Map<string, string>();
  for (const { secret } of placements) {
    if (values.has(secret)) continue;
    const value = await secrets.get(secret);
    if (value === null || value === "") {
      // `checkPlacements` ran first, so the secret is declared.
      if (policy.secrets[secret]?.optional === true) continue;
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
