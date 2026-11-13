import type { Digest, TokenStore } from "@halonicjs/ports";
import { isPlainObject } from "@halonicjs/std";
import {
  type ApprovedSignIn,
  type ApprovedSignInHash,
  approvedSignInHash,
} from "./approved-sign-in.ts";
import { parseJson } from "./json.ts";
import { signInTokenName } from "./sign-in-token-name.ts";
import { isUsableToken } from "./usable-token.ts";

/** What is kept for one sign-in: its refresh token and the sign-in the user approved. */
export interface SignInGrant {
  readonly refreshToken: string;
  readonly approved: ApprovedSignIn;
}

/**
 * What loading a sign-in's grant found.
 * - `none`: nothing is saved, or what is saved can't be read or doesn't match
 *   its own hash. A record like that is removed.
 * - `current`: the grant belongs to the sign-in the sheet describes now.
 * - `stale`: the grant was approved for another sign-in than the sheet
 *   describes now. Its refresh token must not be used for refresh; sign out
 *   revokes it at `approved.revokeUrl` and then removes it.
 */
export type GrantLookup =
  | { readonly kind: "none" }
  | { readonly kind: "current"; readonly grant: SignInGrant }
  | { readonly kind: "stale"; readonly grant: SignInGrant };

/** The refresh tokens of sign-ins, each with the sign-in the user approved for it. */
export interface SignInGrants {
  /**
   * Saves a grant, replacing the one before it: a rotated refresh token is
   * saved here before the new access token is used.
   *
   * @throws RangeError when the refresh token isn't a usable token (see `isUsableToken`)
   */
  save(integration: string, signIn: string, grant: SignInGrant): Promise<void>;
  /**
   * Finds a sign-in's grant and compares its approved sign-in with the one
   * the sheet describes now, on every load.
   *
   * @param current - the sign-in as the sheet and the settings resolve it now
   */
  load(integration: string, signIn: string, current: ApprovedSignIn): Promise<GrantLookup>;
  /** Removes a grant. Removing one that isn't there is not an error. */
  remove(integration: string, signIn: string): Promise<void>;
}

/** The shape of what is saved: one record per sign-in, so the token and its approval can't part. */
interface SavedGrant {
  readonly refreshToken: string;
  readonly approved: ApprovedSignIn;
  readonly hash: ApprovedSignInHash;
}

/**
 * Keeps grants in a `TokenStore` under the names from `signInTokenName`.
 *
 * @param tokens - the server's token store
 * @param digest - the platform's SHA-256
 */
export function createSignInGrants(tokens: TokenStore, digest: Digest): SignInGrants {
  return {
    async save(integration, signIn, grant) {
      if (!isUsableToken(grant.refreshToken)) {
        throw new RangeError("A refresh token must be visible ASCII and long enough to save.");
      }
      const saved: SavedGrant = {
        ...grant,
        hash: await approvedSignInHash(grant.approved, digest),
      };
      await tokens.set(signInTokenName(integration, signIn), JSON.stringify(saved));
    },

    async load(integration, signIn, current) {
      const name = signInTokenName(integration, signIn);
      const text = await tokens.get(name);
      if (text === null) {
        return { kind: "none" };
      }
      const grant = await readSavedGrant(text, digest);
      if (grant === undefined) {
        await tokens.remove(name);
        return { kind: "none" };
      }
      const hashNow = await approvedSignInHash(current, digest);
      return { kind: hashNow === grant.hash ? "current" : "stale", grant: grant.grant };
    },

    async remove(integration, signIn) {
      await tokens.remove(signInTokenName(integration, signIn));
    },
  };
}

/** The saved grant and its hash, or `undefined` when the text isn't a grant that matches its own hash. */
async function readSavedGrant(
  text: string,
  digest: Digest,
): Promise<{ grant: SignInGrant; hash: ApprovedSignInHash } | undefined> {
  const value = parseJson(text);
  if (!isPlainObject(value) || typeof value["refreshToken"] !== "string") {
    return undefined;
  }
  const approved = readApprovedSignIn(value["approved"]);
  if (approved === undefined || typeof value["hash"] !== "string") {
    return undefined;
  }
  if ((await approvedSignInHash(approved, digest)) !== value["hash"]) {
    return undefined;
  }
  return {
    grant: { refreshToken: value["refreshToken"], approved },
    hash: value["hash"] as ApprovedSignInHash,
  };
}

/** The approved sign-in if the value has every required field in the right type, otherwise `undefined`. */
function readApprovedSignIn(value: unknown): ApprovedSignIn | undefined {
  if (!isPlainObject(value)) {
    return undefined;
  }
  const requiredText = ["authorizeUrl", "tokenUrl", "clientId"];
  const optionalText = ["revokeUrl", "issuer", "clientSecretName", "header", "prefix"];
  const valid =
    value["flow"] === "oauth-code" &&
    (value["clientAuth"] === "post" || value["clientAuth"] === "basic") &&
    (value["as"] === "bearer" || value["as"] === "header") &&
    requiredText.every((key) => typeof value[key] === "string") &&
    optionalText.every((key) => value[key] === undefined || typeof value[key] === "string") &&
    isTextList(value["scopes"]) &&
    isTextList(value["accessHosts"]);
  return valid ? (value as unknown as ApprovedSignIn) : undefined;
}

function isTextList(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}
