import {
  type Clock,
  type HttpClient,
  type Secrets,
  SignInNeededError,
  type SignInTokens,
} from "@halonicjs/ports";
import type { ApprovedSignIn } from "./approved-sign-in.ts";
import { type RefreshGrant, type RefreshResult, refreshAccessToken } from "./refresh-grant.ts";
import type { SignInGrant, SignInGrants } from "./sign-in-grants.ts";

/** An access token is refreshed when it has less than this long to live. */
export const accessTokenMinimumLifeMs = 60_000;

/**
 * A 401 forces a refresh only when the token it rejected is at least this old.
 * Some services answer 401 for reasons other than an expired token; without
 * the limit an integration could wear out a rotating refresh token.
 */
export const forcedRefreshIntervalMs = 30_000;

/**
 * How long past its stated expiry an access token stays in the secret filter.
 * Many services honour a token a few minutes longer than `expires_in` says, so
 * a token echoed back just after its expiry must still be removed.
 */
export const filterGraceMs = 600_000;

/** The life assumed for a token whose answer had no `expires_in`; it is placed until {@link accessTokenMinimumLifeMs} of it is left. The filter holds it until the process ends. */
export const unknownLifetimeMs = 300_000;

/** The kit's view of the sign-in tokens, and what only Halonic's side may do. */
export interface ManagedSignInTokens extends SignInTokens {
  /**
   * Drops the token in use for a sign-in that was signed out, so the next
   * `access` doesn't hand it out. What the secret filter holds stays until it
   * expires and its grace period passes: the server may not have revoked it.
   */
  forget(signIn: string): void;
  /**
   * Resolves once no refresh of the sign-in is running, whether it ended well
   * or not. Sign out waits for it first: a refresh that ends after the grant
   * was removed would save its rotated refresh token and sign the user back in.
   */
  settled(signIn: string): Promise<void>;
}

/** What `createSignInTokens` needs. */
export interface SignInTokensSettings {
  /** The integration the sign-ins belong to, as its sheet names it. */
  readonly integration: string;
  readonly grants: SignInGrants;
  /** The server's `HttpClient`: https only, no redirects, a limited answer. */
  readonly http: HttpClient;
  /** Where the client secrets are, by the name in the approved sign-in. */
  readonly secrets: Secrets;
  readonly clock: Clock;
  /**
   * The sign-in as the sheet and the settings describe it now, or `undefined`
   * when the sheet has no sign-in of that name. It is compared with what the
   * user approved, so a changed sheet never inherits a grant.
   */
  resolveSignIn(signIn: string): Promise<ApprovedSignIn | undefined>;
  /** A new signal that aborts after `tokenRequestTimeoutMs`: a core package has no timers. */
  requestSignal(): AbortSignal;
}

/** One access token this process was given. */
interface IssuedToken {
  readonly value: string;
  readonly issuedAtMs: number;
  /** Absent when the answer had no `expires_in`: the filter then holds the token until the process ends. */
  readonly expiresAtMs?: number;
  /** When the token stops being placed: its expiry, or {@link unknownLifetimeMs} after it was issued. */
  readonly usableUntilMs: number;
}

/** What is kept in memory for one sign-in. */
interface SignInState {
  current?: IssuedToken | undefined;
  /** Every access token not yet {@link filterGraceMs} past its expiry, for the secret filter. A rejected one stays: a 401 doesn't prove it was revoked. */
  issued: IssuedToken[];
  refreshToken?: string;
  clientSecret?: string | undefined;
  /** Set when a 401 counted: the next `access` refreshes. */
  rejectedCurrent: boolean;
  /** The refresh in flight, shared by every request that needs one. */
  refreshing?: Promise<string> | undefined;
}

/**
 * The tokens of one integration's sign-ins, in memory and in the grant store.
 * It answers the kit's request for a token to place and never gives one to
 * an integration.
 *
 * - **Single refresh.** However many requests need a token at once, one
 *   refresh runs per sign-in and they all get its result.
 * - **Rotation.** A rotated refresh token is saved before the new access
 *   token is used.
 * - **401.** `rejected` forces a refresh only for the current token, and only
 *   when it is at least {@link forcedRefreshIntervalMs} old.
 * - **Sign in again.** Only when no grant is saved, the grant was approved for
 *   another sign-in than the sheet describes now, or the server answered
 *   `invalid_grant`. The refresh token is then removed.
 *
 * @param settings - the integration, the grant store, the ports and the sign-in resolver
 * @returns the kit's view of the integration's sign-in tokens
 *
 * @example
 * const tokens = createSignInTokens({ integration: "gitlab", grants, http, secrets, clock, resolveSignIn, requestSignal });
 * const value = await tokens.access("work-account");
 */
export function createSignInTokens(settings: SignInTokensSettings): ManagedSignInTokens {
  const states = new Map<string, SignInState>();
  const nowMs = () => settings.clock.now().getTime();

  function stateOf(signIn: string): SignInState {
    let state = states.get(signIn);
    if (state === undefined) {
      state = { issued: [], rejectedCurrent: false };
      states.set(signIn, state);
    }
    return state;
  }

  function isUsable(state: SignInState): state is SignInState & { current: IssuedToken } {
    const { current } = state;
    if (current === undefined || state.rejectedCurrent) {
      return false;
    }
    return current.usableUntilMs - nowMs() >= accessTokenMinimumLifeMs;
  }

  /** Loads what a refresh needs, refreshes, and keeps the result. Runs once at a time per sign-in. */
  async function refresh(signIn: string, state: SignInState): Promise<string> {
    const current = await settings.resolveSignIn(signIn);
    if (current === undefined) {
      throw new SignInNeededError(signIn);
    }
    const found = await settings.grants.load(settings.integration, signIn, current);
    if (found.kind !== "current") {
      // A stale grant belongs to another sign-in: its token is never used to refresh.
      throw new SignInNeededError(signIn);
    }
    const { grant } = found;
    const clientSecret = await readClientSecret(grant.approved);
    state.refreshToken = grant.refreshToken;
    state.clientSecret = clientSecret;

    const result = await refreshAccessToken(settings.http, refreshGrant(grant, clientSecret));
    return keepResult(signIn, state, grant, result);
  }

  async function readClientSecret(approved: ApprovedSignIn): Promise<string | undefined> {
    if (approved.clientSecretName === undefined) {
      return undefined;
    }
    const secret = await settings.secrets.get(approved.clientSecretName);
    if (secret === null) {
      throw new Error(`The client secret "${approved.clientSecretName}" is not set.`);
    }
    return secret;
  }

  function refreshGrant(grant: SignInGrant, clientSecret: string | undefined): RefreshGrant {
    const { approved } = grant;
    return {
      tokenEndpoint: approved.tokenUrl,
      refreshToken: grant.refreshToken,
      client: {
        clientId: approved.clientId,
        clientAuth: approved.clientAuth,
        ...(clientSecret === undefined ? {} : { clientSecret }),
      },
      signal: settings.requestSignal(),
    };
  }

  /** Turns the answer into a token, or into the error that tells the caller what to do. */
  async function keepResult(
    signIn: string,
    state: SignInState,
    grant: SignInGrant,
    result: RefreshResult,
  ): Promise<string> {
    switch (result.kind) {
      case "refreshed": {
        if (result.refreshToken !== undefined) {
          // Saved before the new access token is used, so a crash can't lose the only valid one.
          await settings.grants.save(settings.integration, signIn, {
            ...grant,
            refreshToken: result.refreshToken,
          });
          state.refreshToken = result.refreshToken;
        }
        const issuedAtMs = nowMs();
        const token: IssuedToken = {
          value: result.accessToken,
          issuedAtMs,
          usableUntilMs: issuedAtMs + (result.expiresIn ?? unknownLifetimeMs / 1000) * 1000,
          ...(result.expiresIn === undefined
            ? {}
            : { expiresAtMs: issuedAtMs + result.expiresIn * 1000 }),
        };
        state.current = token;
        state.rejectedCurrent = false;
        state.issued.push(token);
        return token.value;
      }
      case "grantRefused":
        await settings.grants.remove(settings.integration, signIn);
        state.current = undefined;
        throw new SignInNeededError(signIn);
      case "clientRefused":
        throw new Error(`The server no longer accepts the client of the sign-in "${signIn}".`);
      case "providerError":
        throw new Error(
          `The refresh of the sign-in "${signIn}" failed: ${result.errorCode} (status ${result.status}).`,
        );
      case "unexpectedAnswer":
        throw new Error(
          `The refresh of the sign-in "${signIn}" got an unexpected answer (status ${result.status}).`,
        );
      case "unreachable":
        throw new Error(`The server of the sign-in "${signIn}" could not be reached to refresh.`);
    }
  }

  return {
    forget(signIn) {
      const state = states.get(signIn);
      if (state !== undefined) {
        state.current = undefined;
        state.rejectedCurrent = false;
      }
    },

    async settled(signIn) {
      // A failed refresh reaches the requests that waited for it; here only its end matters.
      await states.get(signIn)?.refreshing?.catch(() => undefined);
    },

    async access(signIn, signal) {
      const state = stateOf(signIn);
      if (isUsable(state)) {
        return state.current.value;
      }
      // Checked before the refresh starts: a refresh nobody waits for would leave its failure unhandled.
      signal?.throwIfAborted();
      // One refresh serves every request waiting for it. It keeps its own time limit,
      // so a caller that gives up doesn't cancel the refresh the others wait for.
      state.refreshing ??= refresh(signIn, state).finally(() => {
        state.refreshing = undefined;
      });
      return waitUnlessAborted(state.refreshing, signal);
    },

    rejected(signIn, value) {
      const state = states.get(signIn);
      const { current } = state ?? {};
      if (state === undefined || current === undefined || current.value !== value) {
        return;
      }
      if (nowMs() - current.issuedAtMs >= forcedRefreshIntervalMs) {
        state.rejectedCurrent = true;
      }
    },

    filterValues() {
      const now = nowMs();
      const values: string[] = [];
      for (const state of states.values()) {
        state.issued = state.issued.filter(
          ({ expiresAtMs }) => expiresAtMs === undefined || expiresAtMs + filterGraceMs > now,
        );
        values.push(...state.issued.map(({ value }) => value));
        for (const secret of [state.refreshToken, state.clientSecret]) {
          if (secret !== undefined) {
            values.push(secret);
          }
        }
      }
      return values;
    },
  };
}

/** The work's result, or the signal's reason as soon as it aborts. The work itself carries on. */
function waitUnlessAborted<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) {
    return work;
  }
  if (signal.aborted) {
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}
