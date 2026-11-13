import { SignInNeededError, type SignInPlacement, type SignInTokens } from "@halonicjs/ports";
import { IntegrationRefusedError } from "./integration/index.ts";
import { type DeclaredSignIn, hostIn, type IntegrationPolicy } from "./policy.ts";
import { checkSecretLength, describe, matchesSheet, quoted } from "./secret-placement.ts";

/** The sheet's entry for a sign-in, looked up by own key only, so `toString` is never a sign-in. */
function declaredSignIn(policy: IntegrationPolicy, signIn: string): DeclaredSignIn | undefined {
  return Object.hasOwn(policy.signIns, signIn) ? policy.signIns[signIn] : undefined;
}

/**
 * Checks that the sign-in is declared and that the code places its token the
 * way the sheet's `access` block says, with the same check as a secret's
 * placement (`placement-not-in-sheet`). Runs before any token is asked for.
 */
export function checkSignInPlacement(policy: IntegrationPolicy, placement: SignInPlacement): void {
  const declared = declaredSignIn(policy, placement.signIn);
  if (declared === undefined) {
    throw new IntegrationRefusedError(
      "sign-in-not-declared",
      `${policy.name}: the sign-in ${quoted(placement.signIn)} is not in its permission sheet`,
    );
  }
  if (!matchesSheet(placement, declared)) {
    throw new IntegrationRefusedError(
      "placement-not-in-sheet",
      `${policy.name}: the token of the sign-in ${quoted(placement.signIn)} goes ${describe(declared)} in its permission sheet, not ${describe(placement)}`,
    );
  }
}

/**
 * Checks that the token may go to the request's first host. Unlike a
 * secret, a token never goes over plain `http`, not even to this machine.
 */
export function checkSignInPlacementHost(
  policy: IntegrationPolicy,
  placement: SignInPlacement,
  url: URL,
): void {
  const declared = declaredSignIn(policy, placement.signIn);
  if (declared === undefined || !hostIn(declared.hosts, url)) {
    throw new IntegrationRefusedError(
      "token-not-allowed-for-host",
      `${policy.name}: the token of the sign-in ${quoted(placement.signIn)} may not go to ${url.host}`,
    );
  }
  if (!mayCarryToken(url)) {
    throw new IntegrationRefusedError(
      "token-over-plain-http",
      `${policy.name}: the token of the sign-in ${quoted(placement.signIn)} may not go over plain http (${url.host})`,
    );
  }
}

/** A token goes over `https` only. */
function mayCarryToken(url: URL): boolean {
  return url.protocol === "https:";
}

/** Whether this hop may carry the token of the sign-in. */
function mayGoTo(policy: IntegrationPolicy, signIn: string, url: URL): boolean {
  const declared = declaredSignIn(policy, signIn);
  return declared !== undefined && hostIn(declared.hosts, url) && mayCarryToken(url);
}

/**
 * The access tokens this hop will carry, one per sign-in whose token may go
 * to the hop's host. A sign-in that may not go there is not asked for, so a
 * redirect to another declared host neither refreshes nor places its token.
 *
 * @throws {IntegrationRefusedError} `sign-in-needed` when the user has to sign in (again), or when no sign-ins are set up at all
 */
export async function readTokens(
  policy: IntegrationPolicy,
  tokens: SignInTokens | undefined,
  placements: readonly SignInPlacement[],
  url: URL,
  signal: AbortSignal,
): Promise<Map<string, string>> {
  const values = new Map<string, string>();
  for (const { signIn } of placements) {
    if (values.has(signIn) || !mayGoTo(policy, signIn, url)) continue;
    const value = await accessToken(policy, tokens, signIn, signal);
    checkSecretLength(policy.name, `sign-in ${signIn}`, value);
    values.set(signIn, value);
  }
  return values;
}

async function accessToken(
  policy: IntegrationPolicy,
  tokens: SignInTokens | undefined,
  signIn: string,
  signal: AbortSignal,
): Promise<string> {
  try {
    if (tokens === undefined) throw new SignInNeededError(signIn);
    return await tokens.access(signIn, signal);
  } catch (error) {
    if (!(error instanceof SignInNeededError)) throw error;
    throw new IntegrationRefusedError(
      "sign-in-needed",
      `${policy.name}: the sign-in ${quoted(signIn)} needs you to sign in again`,
    );
  }
}

/** Puts the token into the headers, when this hop was asked for it. */
export function placeToken(
  placement: SignInPlacement,
  value: string | undefined,
  headers: Headers,
): void {
  if (value === undefined) return;
  if (placement.as === "bearer") headers.set("authorization", `Bearer ${value}`);
  else headers.set(placement.header, `${placement.prefix ?? ""}${value}`);
}

/**
 * Tells the sign-in the server answered 401 to the tokens this hop placed.
 * It counts a value only while it is the sign-in's current token and decides
 * about refreshing; the kit never resends the request.
 */
export function reportRejected(
  tokens: SignInTokens | undefined,
  placed: ReadonlyMap<string, string>,
): void {
  for (const [signIn, value] of placed) tokens?.rejected(signIn, value);
}
