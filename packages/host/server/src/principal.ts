import { type CloudProfile, checkCloudProfile } from "./cloud-profile.ts";

/**
 * Who is asking in a multi-user deployment, and in which scope. A principal is built only from a
 * session's checked claims, or read back from a stored record with the same checks, never from a
 * request body, a path or a storage name.
 */

/** An end user's id: `eu_` and 16 to 40 letters or digits. */
const endUserIdPattern = /^eu_[A-Za-z0-9]{16,40}$/;
/** An organisation's id: `org_` and 16 to 40 letters or digits. */
const orgIdPattern = /^org_[A-Za-z0-9]{16,40}$/;

/** The only audience a deployment accepts, so a token meant for anything else is refused. */
export const SESSION_AUDIENCE = "app";

/** What a `client` claim may hold: 1 to 64 printable ASCII characters, because people see it. */
const clientPattern = /^[\x20-\x7E]{1,64}$/;

/** The format of a stored principal record, so a later format can be told apart. */
const principalRecordVersion = 1;

/** The roles in an organisation's scope. A personal scope has only `owner`. */
const orgRoles: ReadonlySet<string> = new Set(["owner", "admin", "member"]);

/** A scope owned by one end user or by one organisation. Two scopes share no stored data. */
export type Scope =
  | { readonly kind: "user"; readonly endUserId: string }
  | { readonly kind: "org"; readonly orgId: string };

/** What the actor may do in the scope: `owner` in their own scope, or their role in an organisation. */
export type Role = "owner" | "admin" | "member";

/** Set only by {@link checkPrincipal}, so a principal can't be written as a plain object literal. */
declare const checked: unique symbol;

/** The signed-in end user, the scope this session works in, and their role there. */
export type Principal = {
  readonly actor: string;
  readonly scope: Scope;
  readonly role: Role;
} & { readonly [checked]: true };

/** A principal as plain text fields, the form a run stores and reads back. */
export interface PrincipalRecord {
  readonly v: typeof principalRecordVersion;
  readonly actor: string;
  readonly scope: string;
  readonly role: string;
}

/**
 * The claims a session token carries, as the verifier decoded them. Every field is unchecked:
 * {@link checkClaims} decides whether they make a principal.
 */
export interface SessionClaims {
  /** Must be exactly {@link SESSION_AUDIENCE}. */
  readonly aud?: unknown;
  /** The signed-in end user's id. */
  readonly sub?: unknown;
  /** `u/<end-user id>` or `o/<organisation id>`. */
  readonly scope?: unknown;
  /** Needed for an organisation's scope; for a personal scope missing or `owner`. */
  readonly role?: unknown;
  /** The app the token was issued to, for display and revocation only. */
  readonly client?: unknown;
  /** The session's id, for revocation and sign-out; it grants nothing. */
  readonly sid?: unknown;
  /** The customer's display name or email, from Halonic Cloud; it grants nothing. */
  readonly name?: unknown;
  /** The product's account page on Cloud, `https:`; it grants nothing. */
  readonly account?: unknown;
  /** The product's name, from Halonic Cloud; it grants nothing. */
  readonly product_name?: unknown;
}

/** A session that passed the checks: who is asking, and the client, which grants nothing. */
export interface CheckedSession {
  readonly principal: Principal;
  readonly client: string | null;
  /**
   * The session's id from the `sid` claim, for revocation and sign-out, or `null` when the token
   * has none or one that isn't 1 to 128 printable ASCII characters. It grants nothing.
   */
  readonly sessionId: string | null;
  /**
   * The customer's name, account page and product name when the token carries all three, else
   * `null`. Shown in the account menu only; it grants nothing.
   */
  readonly profile: CloudProfile | null;
}

/**
 * Checks a session's claims and builds its principal. Refuses an audience that isn't exactly
 * `app`, an end-user id or scope that doesn't match its pattern, a personal scope that isn't
 * the actor's own or has a role other than `owner`, and an organisation scope with no known
 * role. The `client` claim never reaches the principal, so no permission can depend on it; it
 * must be 1 to 64 printable ASCII characters and is refused, never cleaned up, otherwise. The
 * `name`, `account` and `product_name` claims are checked by {@link checkCloudProfile}: all three
 * or none, and a wrong one refuses the session.
 *
 * The claims are untrusted input whatever verifier returned them: anything that isn't an object
 * of claims, a missing claim or a claim of the wrong type is refused. Extra claims are ignored.
 *
 * @returns the checked session, or `null` when the claims are refused
 */
export function checkClaims(claims: unknown): CheckedSession | null {
  if (!isFieldRecord(claims) || ownValue(claims, "aud") !== SESSION_AUDIENCE) {
    return null;
  }
  const client = ownValue(claims, "client");
  if (client !== undefined && (typeof client !== "string" || !clientPattern.test(client))) {
    return null;
  }
  const givenRole = ownValue(claims, "role");
  const role = givenRole === undefined ? "owner" : givenRole;
  const sub = ownValue(claims, "sub");
  const principal = checkPrincipal(sub, ownValue(claims, "scope"), role, givenRole !== undefined);
  const profile = checkCloudProfile((name) => ownValue(claims, name));
  if (principal === null || !profile.ok) {
    return null;
  }
  return Object.freeze({
    principal,
    client: client ?? null,
    sessionId: sessionIdOf(claims),
    profile: profile.profile,
  });
}

/** A key or session id as the token holds it: 1 to 128 printable ASCII characters. */
const sessionIdPattern = /^[\x21-\x7E]{1,128}$/;

/** The `sid` claim when it is a well-formed id; otherwise `null`, never a refusal. */
function sessionIdOf(claims: object): string | null {
  const sid = ownValue(claims, "sid");
  return typeof sid === "string" && sessionIdPattern.test(sid) ? sid : null;
}

/** Turns a principal into the record a run keeps, so background work uses the stored principal. */
export function principalToRecord(principal: Principal): PrincipalRecord {
  return Object.freeze({
    v: principalRecordVersion,
    actor: principal.actor,
    scope: scopeName(principal.scope),
    role: principal.role,
  });
}

/**
 * Reads back a stored principal with the same checks a session gets. The record is untrusted
 * input: one with another format version, or that isn't a record at all, is refused.
 *
 * @returns the principal, or `null` when the record breaks a rule
 */
export function principalFromRecord(record: unknown): Principal | null {
  if (!isFieldRecord(record) || ownValue(record, "v") !== principalRecordVersion) {
    return null;
  }
  const actor = ownValue(record, "actor");
  return checkPrincipal(actor, ownValue(record, "scope"), ownValue(record, "role"), true);
}

/** A scope as the text a token and a record hold: `u/<id>` or `o/<id>`, with no trailing `/`. */
export function scopeName(scope: Scope): string {
  return scope.kind === "user" ? `u/${scope.endUserId}` : `o/${scope.orgId}`;
}

/**
 * The name prefix a runtime gets for a scope. It always ends in `/`, so no id can be the start
 * of another id's names.
 */
export function scopePrefix(scope: Scope): string {
  return `${scopeName(scope)}/`;
}

/**
 * Reads `u/<end-user id>` or `o/<organisation id>`, and nothing else: no trailing `/`, no
 * encoding, no other kind.
 */
export function parseScope(text: unknown): Scope | null {
  if (typeof text !== "string") {
    return null;
  }
  const separator = text.indexOf("/");
  const kind = text.slice(0, separator + 1);
  const id = text.slice(separator + 1);
  if (kind === "u/" && endUserIdPattern.test(id)) {
    return Object.freeze({ kind: "user", endUserId: id });
  }
  if (kind === "o/" && orgIdPattern.test(id)) {
    return Object.freeze({ kind: "org", orgId: id });
  }
  return null;
}

/**
 * The rules every principal meets, from a token or from a record. `roleWasGiven` is false only
 * when a token left out the role, which a personal scope may do.
 */
function checkPrincipal(
  actor: unknown,
  scopeText: unknown,
  role: unknown,
  roleWasGiven: boolean,
): Principal | null {
  if (typeof actor !== "string" || !endUserIdPattern.test(actor)) {
    return null;
  }
  const scope = parseScope(scopeText);
  if (scope === null || typeof role !== "string") {
    return null;
  }
  if (scope.kind === "user" && (scope.endUserId !== actor || role !== "owner")) {
    return null;
  }
  if (scope.kind === "org" && (!roleWasGiven || !orgRoles.has(role))) {
    return null;
  }
  return Object.freeze({ actor, scope, role: role as Role }) as Principal;
}

/**
 * Whether `value` is an object of named fields, not `null`, an array or a primitive. Its fields
 * stay unchecked: the caller reads each one with {@link ownValue} and checks it.
 */
function isFieldRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The value of the object's own data field `name`, read once. An inherited field or one behind a
 * getter counts as missing, so a claim can't give one value to a check and another to the
 * principal.
 */
function ownValue(record: object, name: string): unknown {
  const field = Object.getOwnPropertyDescriptor(record, name);
  return field !== undefined && "value" in field ? field.value : undefined;
}
