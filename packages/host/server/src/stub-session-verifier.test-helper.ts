import type { SessionClaims } from "./principal.ts";
import type { SessionCredential, SessionVerifier } from "./session-verifier.ts";

/** Ids that match the end-user and organisation patterns, for tests. */
export const ids = {
  alice: "eu_aliceAAAAAAAAAAAAAAAA",
  bob: "eu_bobBBBBBBBBBBBBBBBBBB",
  acme: "org_acmeAAAAAAAAAAAAAAAA",
} as const;

/** Claims for `actor` in their own scope, with any field replaced. */
export function personalClaims(actor: string, changes: SessionClaims = {}): SessionClaims {
  return { aud: "app", sub: actor, scope: `u/${actor}`, role: "owner", ...changes };
}

/**
 * A verifier for tests only: it knows a fixed set of tokens and their claims, checks no
 * signature, and records every credential it was given. It is never exported from the package.
 */
export class StubSessionVerifier implements SessionVerifier {
  readonly seen: SessionCredential[] = [];
  readonly #claimsByToken: ReadonlyMap<string, SessionClaims>;

  constructor(claimsByToken: Readonly<Record<string, SessionClaims>>) {
    this.#claimsByToken = new Map(Object.entries(claimsByToken));
  }

  /** The claims stored for the token, or `null` for a token it doesn't know. */
  async verify(credential: SessionCredential): Promise<SessionClaims | null> {
    this.seen.push(credential);
    return this.#claimsByToken.get(credential.token) ?? null;
  }
}
