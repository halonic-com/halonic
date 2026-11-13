import type { AuthPlacement, SecretPlacement, SignInPlacement } from "@halonicjs/ports";
import { IntegrationRefusedError } from "./integration/index.ts";
import type { IntegrationPolicy } from "./policy.ts";
import { checkSecretHost, checkSecretPlacement, placeSecret, quoted } from "./secret-placement.ts";
import { checkSignInPlacement, checkSignInPlacementHost, placeToken } from "./sign-in-placement.ts";

/** The placement puts a secret, not a sign-in's token. */
export function isSecretPlacement(placement: AuthPlacement): placement is SecretPlacement {
  return "secret" in placement;
}

/** The placement puts a sign-in's access token, not a secret. */
export function isSignInPlacement(placement: AuthPlacement): placement is SignInPlacement {
  return "signIn" in placement;
}

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
): readonly AuthPlacement[] {
  return Object.freeze(placements.map((placement) => copyPlacement(policy, placement)));
}

/** A placement as the integration's code may give it, with nothing trusted. */
interface GivenPlacement {
  readonly secret?: unknown;
  readonly signIn?: unknown;
  readonly as?: unknown;
  readonly header?: unknown;
  readonly prefix?: unknown;
  readonly field?: unknown;
}

function copyPlacement(policy: IntegrationPolicy, placement: unknown): AuthPlacement {
  if (typeof placement !== "object" || placement === null) {
    throw new IntegrationRefusedError(
      "placement-not-in-sheet",
      `${policy.name}: a placement is not an object with text fields`,
    );
  }
  const given: GivenPlacement = placement;
  // The types say `secret` and `signIn` never appear together. If both do, nothing is placed, so a `signIn` key can't carry a secret past the secret check.
  if ("secret" in given && "signIn" in given) {
    throw new IntegrationRefusedError(
      "placement-not-in-sheet",
      `${policy.name}: a placement names both a secret and a sign-in; it must name one`,
    );
  }
  const kind = "signIn" in given ? "signIn" : "secret";
  const owner = kind === "signIn" ? "sign-in" : "secret";
  const name = given[kind];
  const as = given.as;
  if (typeof name !== "string") throw notText(policy, `the ${owner}'s name`, owner);
  if (typeof as !== "string")
    throw notText(policy, `the "as" of the ${owner} ${quoted(name)}`, owner);
  const copy: Record<string, string> = { [kind]: name, as };
  for (const key of ["header", "prefix", "field"] as const) {
    const value = given[key];
    if (value === undefined) continue;
    if (typeof value !== "string")
      throw notText(policy, `the "${key}" of the ${owner} ${quoted(name)}`, owner);
    copy[key] = value;
  }
  // Whether the fields fit together is for `checkPlacements` to say.
  return Object.freeze(copy) as unknown as AuthPlacement;
}

/** A part of a placement that isn't text, named with the kind of placement it is in. */
function notText(policy: IntegrationPolicy, what: string, kind: string): IntegrationRefusedError {
  return new IntegrationRefusedError(
    "placement-not-in-sheet",
    `${policy.name}: ${what} in a ${kind} placement is not text`,
  );
}

/**
 * Checks every placement against the sheet before a secret value or a token
 * is read. Give it the copies from {@link copyPlacements}, never the code's
 * own objects. Where a secret or token may go is for
 * {@link checkPlacementHosts}.
 */
export function checkPlacements(
  policy: IntegrationPolicy,
  placements: readonly AuthPlacement[],
): void {
  for (const placement of placements) {
    if (isSecretPlacement(placement)) checkSecretPlacement(policy, placement);
    else checkSignInPlacement(policy, placement);
  }
}

/**
 * Checks that every placed secret or token may go to the request's first
 * host, once the URL is parsed. {@link checkPlacements} has already run, so
 * every secret and sign-in is declared.
 */
export function checkPlacementHosts(
  policy: IntegrationPolicy,
  placements: readonly AuthPlacement[],
  url: URL,
): void {
  for (const placement of placements) {
    if (isSecretPlacement(placement)) checkSecretHost(policy, placement, url);
    else checkSignInPlacementHost(policy, placement, url);
  }
}

/**
 * Puts the secrets and tokens allowed for this hop's host into the headers
 * and the form body. A placement whose secret or token may not go to this
 * hop is left out, which happens after a redirect to another declared host.
 *
 * @param tokens the access tokens read for this hop, by sign-in
 * @returns the form body to send, when a placement wrote into it
 */
export function place(
  policy: IntegrationPolicy,
  placements: readonly AuthPlacement[],
  values: {
    readonly secrets: ReadonlyMap<string, string>;
    readonly tokens: ReadonlyMap<string, string>;
  },
  url: URL,
  headers: Headers,
  form: URLSearchParams | undefined,
): URLSearchParams | undefined {
  let body = form;
  for (const placement of placements) {
    if (isSecretPlacement(placement)) {
      body = placeSecret(
        policy,
        placement,
        values.secrets.get(placement.secret),
        url,
        headers,
        body,
      );
    } else {
      placeToken(placement, values.tokens.get(placement.signIn), headers);
    }
  }
  return body;
}
