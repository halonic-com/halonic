import { decodeBase64url } from "@halonicjs/std";
import { checkCloudProfile } from "./cloud-profile.ts";
import { isHttpsOrigin } from "./https-origin.ts";
import type { SessionClaims } from "./principal.ts";
import type { SessionCredential, SessionVerifier } from "./session-verifier.ts";

/**
 * A public key from Halonic Cloud's key set, already imported. Its `job` says what it may sign:
 * only a `session` key may verify a session token.
 */
export interface CloudKey {
  readonly id: string;
  readonly job: "session" | "command";
  readonly publicKey: CryptoKey;
}

/**
 * Halonic Cloud's public keys, by key id. A key set that can't answer (Cloud is down and nothing
 * is cached, say) throws, so the request fails instead of counting as not signed in.
 */
export interface CloudKeySet {
  /** The key with this id, or `null` when the set has none. */
  key(id: string): Promise<CloudKey | null>;
}

/**
 * The sessions Halonic Cloud has ended before their tokens run out. A list that can't answer
 * throws, so a token is never accepted without the check.
 */
export interface RevokedSessions {
  /** Whether the session with this id has been ended. */
  isRevoked(sessionId: string): Promise<boolean>;
}

/** What a {@link CloudSessionVerifier} needs. */
export interface CloudSessionVerifierOptions {
  /** The sign-in origin from the deployment's config, `https` only. Tokens name it as `iss`. */
  readonly signInOrigin: string;
  /** This deployment's product id. Tokens name it as `aud`. */
  readonly product: string;
  readonly keySet: CloudKeySet;
  readonly revokedSessions: RevokedSessions;
  /** The current time in milliseconds; tests pass a fixed clock. */
  readonly now?: () => number;
}

/** The longest token accepted, the same limit as a bearer token. */
const maxTokenLength = 8192;
/** How far the deployment's clock may differ from Cloud's, in seconds. */
const clockSkewSeconds = 60;
/**
 * The longest a token may live, from `iat` to `exp`, in seconds. A revoked session id is kept
 * only for this long plus the skew, so a token living longer would be accepted again once its
 * revocation entry is gone: raise this only together with that entry's lifetime.
 */
const maxTokenLifetimeSeconds = 15 * 60;
/** The only header values accepted: the verifier fixes the algorithm, never the token. */
const signatureAlgorithm = "EdDSA";
const tokenType = "JWT";
/** What a session for the deployment's own pages says it is. */
const appSessionAudience = "app";
const accessTokenUse = "access";
/** A key id or session id: 1 to 128 printable ASCII characters. */
const idPattern = /^[\x21-\x7E]{1,128}$/;

/**
 * Verifies the session tokens Halonic Cloud issues for a deployment's end users: compact JSON Web
 * Tokens signed with Ed25519 by a `session` key from Cloud's key set. It accepts a token only for
 * this product and the `app` audience, within its time window and not revoked, with a well-formed
 * customer name, account page and product name, then hands the claims to the server's shared
 * claim checks. Every refusal is the same `null`.
 */
export class CloudSessionVerifier implements SessionVerifier {
  readonly #options: CloudSessionVerifierOptions;
  readonly #now: () => number;

  constructor(options: CloudSessionVerifierOptions) {
    if (!isHttpsOrigin(options.signInOrigin)) {
      throw new Error("The sign-in origin must be an https origin with no path.");
    }
    if (options.product === "") {
      throw new Error("The product id must not be empty.");
    }
    this.#options = options;
    this.#now = options.now ?? Date.now;
  }

  /** The token's claims, mapped for the shared claim checks, or `null` when it is refused. */
  async verify(credential: SessionCredential): Promise<SessionClaims | null> {
    const token = parseToken(credential.token);
    if (token === null || !hasAcceptedHeader(token.header)) {
      return null;
    }
    const key = await this.#options.keySet.key(ownString(token.header, "kid") ?? "");
    if (key === null || !(await isSignedBy(key, token))) {
      return null;
    }
    const payload = token.payload;
    if (!this.#isForThisApp(payload) || !this.#isInTimeWindow(payload)) {
      return null;
    }
    if (!checkCloudProfile((name) => ownValue(payload, name)).ok) {
      return null;
    }
    const sessionId = ownString(payload, "sid");
    if (sessionId === undefined || !idPattern.test(sessionId)) {
      return null;
    }
    if (await this.#options.revokedSessions.isRevoked(sessionId)) {
      return null;
    }
    return claimsFor(payload, sessionId);
  }

  /** Issued by this origin for this product's own pages, as an access token. */
  #isForThisApp(payload: object): boolean {
    return (
      ownValue(payload, "iss") === this.#options.signInOrigin &&
      ownValue(payload, "aud") === this.#options.product &&
      ownValue(payload, "session_audience") === appSessionAudience &&
      ownValue(payload, "token_use") === accessTokenUse
    );
  }

  /**
   * Not yet ended, already started and not issued in the future, each with the allowed skew, and
   * living no longer than the longest lifetime.
   */
  #isInTimeWindow(payload: object): boolean {
    const expires = ownNumber(payload, "exp");
    const notBefore = ownNumber(payload, "nbf");
    const issued = ownNumber(payload, "iat");
    if (expires === undefined || notBefore === undefined || issued === undefined) {
      return false;
    }
    if (expires - issued > maxTokenLifetimeSeconds) {
      return false;
    }
    const nowSeconds = this.#now() / 1000;
    return (
      nowSeconds < expires + clockSkewSeconds &&
      notBefore <= nowSeconds + clockSkewSeconds &&
      issued <= nowSeconds + clockSkewSeconds
    );
  }
}

/** A compact token split into its decoded parts and the bytes the signature covers. */
interface ParsedToken {
  readonly header: object;
  readonly payload: object;
  readonly signedBytes: Uint8Array<ArrayBuffer>;
  readonly signature: Uint8Array<ArrayBuffer>;
}

/** Splits and decodes `header.payload.signature`, or `null` for anything malformed. */
function parseToken(token: string): ParsedToken | null {
  if (token.length > maxTokenLength) {
    return null;
  }
  const parts = token.split(".");
  const [headerText, payloadText, signatureText] = parts;
  if (parts.length !== 3 || headerText === undefined || payloadText === undefined) {
    return null;
  }
  const header = decodeJsonObject(headerText);
  const payload = decodeJsonObject(payloadText);
  const signature = decodeBase64url(signatureText ?? "");
  if (header === null || payload === null || signature === undefined) {
    return null;
  }
  // Copied into a plain ArrayBuffer, the only buffer WebCrypto's types accept on every runtime.
  const signedBytes = new Uint8Array(new TextEncoder().encode(`${headerText}.${payloadText}`));
  return { header, payload, signedBytes, signature };
}

/** The algorithm and type this verifier fixes, a well-formed key id, and no critical extension. */
function hasAcceptedHeader(header: object): boolean {
  const keyId = ownString(header, "kid");
  return (
    ownValue(header, "alg") === signatureAlgorithm &&
    ownValue(header, "typ") === tokenType &&
    keyId !== undefined &&
    idPattern.test(keyId) &&
    !Object.hasOwn(header, "crit")
  );
}

/** Whether a `session` key of the right algorithm signed the token. */
async function isSignedBy(key: CloudKey, token: ParsedToken): Promise<boolean> {
  if (key.job !== "session" || key.publicKey.algorithm.name !== "Ed25519") {
    return false;
  }
  return crypto.subtle.verify("Ed25519", key.publicKey, token.signature, token.signedBytes);
}

/**
 * The claims in the form the shared checks read. Cloud's `aud` names the product, which was
 * checked above, so the shared audience becomes `app`. A token without a scope works in its
 * user's own scope, the only kind there is until organisations come. The customer's name, account
 * page and product name go on for the account menu.
 */
function claimsFor(payload: object, sessionId: string): SessionClaims {
  const sub = ownValue(payload, "sub");
  const scope = ownValue(payload, "scope") ?? (typeof sub === "string" ? `u/${sub}` : undefined);
  return {
    aud: appSessionAudience,
    sub,
    scope,
    role: ownValue(payload, "role"),
    sid: sessionId,
    name: ownValue(payload, "name"),
    account: ownValue(payload, "account"),
    product_name: ownValue(payload, "product_name"),
  };
}

/** Base64url JSON that must hold an object, or `null`. */
function decodeJsonObject(text: string): object | null {
  const bytes = decodeBase64url(text);
  if (bytes === undefined) {
    return null;
  }
  let value: unknown;
  try {
    // `ignoreBOM: true` keeps a leading byte-order mark in the text, so `JSON.parse` refuses it.
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes));
  } catch {
    // Not UTF-8 or not JSON: the token is malformed, which is a refusal like any other.
    return null;
  }
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}

/** An own field's value; an inherited one counts as missing. */
function ownValue(record: object, name: string): unknown {
  return Object.hasOwn(record, name) ? (record as Record<string, unknown>)[name] : undefined;
}

function ownString(record: object, name: string): string | undefined {
  const value = ownValue(record, name);
  return typeof value === "string" ? value : undefined;
}

function ownNumber(record: object, name: string): number | undefined {
  const value = ownValue(record, name);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
