import { expect } from "vitest";
import { signInName } from "./example-sheet.ts";
import { createSignInRig, type SignInRig } from "./sign-in-rig.ts";

export const second = 1000;
export const bearer = { signIn: signInName, as: "bearer" } as const;

/** A rig that is signed in and has made one request, so the provider has issued an access token. */
export async function signedInRig(
  options: Parameters<typeof createSignInRig>[0] = {},
): Promise<SignInRig> {
  const rig = createSignInRig(options);
  expect((await rig.signIn()).outcome).toMatchObject({ kind: "signedIn" });
  expect((await rig.api()).status).toBe(200);
  return rig;
}

/**
 * Gets a second access token while the first is still within its life, as a
 * 401 for a token older than 30 seconds does. Both then work at the provider.
 * Returns the first.
 */
export async function refreshWhileFirstTokenLives(rig: SignInRig): Promise<string> {
  const first = currentToken(rig);
  rig.server.handle(rig.server.apiHost, () => new Response("no", { status: 401 }));
  rig.advance(31 * second);
  await rig.api();
  rig.server.handle(rig.server.apiHost, () => undefined);
  expect((await rig.api()).status).toBe(200);
  expect(currentToken(rig)).not.toBe(first);
  expect(rig.server.accessTokenWorks(first)).toBe(true);
  return first;
}

/** The access token the provider issued last. */
export function currentToken(rig: SignInRig): string {
  return [...(rig.server.ledger.grants[0]?.accessTokens.keys() ?? [])].at(-1) ?? "";
}

export function redirectTo(location: string): Response {
  return new Response(null, { status: 302, headers: { location } });
}

/** The requests to a host, as the provider received them. */
export function requestsTo(rig: SignInRig, host: string) {
  return rig.server.requests.filter((request) => request.url.host === host);
}

/** The code a request ends with, or `undefined` when it went through. */
export async function refusedWith(promise: Promise<unknown>): Promise<string | undefined> {
  return await promise.then(
    () => undefined,
    (error: unknown) => (error as { code?: string }).code,
  );
}
