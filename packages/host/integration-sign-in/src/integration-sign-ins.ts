import { approvedSignIns, type IntegrationSheet, type PolicyProblem } from "@halonicjs/format";
import {
  type ApprovedSignIn,
  createSignInTokens,
  type ManagedSignInTokens,
  type SignInGrants,
  type SignOutResult,
  type SignOutSettings,
  signOut as signOutAtServer,
} from "@halonicjs/oauth-sign-in";
import {
  type Clock,
  type HttpClient,
  type Secrets,
  SignInNeededError,
  type SignInTokens,
} from "@halonicjs/ports";

/** The sheet and the settings of an integration, as they are at this moment. */
export interface SignInSource {
  readonly sheet: IntegrationSheet;
  readonly settings: Readonly<Record<string, unknown>>;
}

/** What `createIntegrationSignIns` needs. */
export interface IntegrationSignInsSettings {
  /** The integration, as its sheet names it. */
  readonly integration: string;
  /**
   * The integration's sheet and settings now. It is read each time a sign-in
   * is looked at, never kept, so an update or a changed setting counts at once
   * and the grant's approval is compared with it.
   */
  current(): Promise<SignInSource>;
  readonly grants: SignInGrants;
  /** The server's `HttpClient`: https only, no redirects, a limited answer. */
  readonly http: HttpClient;
  readonly secrets: Secrets;
  readonly clock: Clock;
  /** A new signal that aborts after the token request's time limit. */
  requestSignal(): AbortSignal;
}

/**
 * What a sign-in's name stands for now.
 * - `approvable`: the sign-in with every setting filled in, as the trust check shows it.
 * - `unknown`: the sheet has no sign-in of that name.
 * - `settingsInvalid`: a setting the sign-in reads is missing or wrong.
 */
export type SignInLookup =
  | { readonly kind: "approvable"; readonly signIn: ApprovedSignIn }
  | { readonly kind: "unknown" }
  | { readonly kind: "settingsInvalid"; readonly problems: readonly PolicyProblem[] };

/** One integration's sign-ins, as the host runs them. */
export interface IntegrationSignIns {
  /** What the kit asks for tokens. A sign-in that is being signed out gives none. */
  readonly tokens: SignInTokens;
  /** The sign-in the sheet and the settings describe now, for the trust check and for the start of a sign-in. */
  lookUp(signIn: string): Promise<SignInLookup>;
  /**
   * Signs out: waits for a refresh in flight, revokes at the address the user
   * approved and removes the grant. While it runs, `tokens` give nothing for
   * this sign-in, so no new refresh can save a token after the grant is gone.
   */
  signOut(signIn: string): Promise<SignOutResult>;
}

/**
 * The host's side of an integration's sign-ins: the tokens for the kit, the
 * sign-ins filled in by `approvedSignIns`, and sign-out.
 *
 * @example
 * const { tokens, signOut } = createIntegrationSignIns({ integration: "gitlab", current, grants, http, secrets, clock, requestSignal });
 */
export function createIntegrationSignIns(settings: IntegrationSignInsSettings): IntegrationSignIns {
  const signingOut = new Map<string, Promise<SignOutResult>>();

  async function lookUp(signIn: string): Promise<SignInLookup> {
    const { sheet, settings: values } = await settings.current();
    if (!Object.hasOwn(sheet.signIns, signIn)) {
      return { kind: "unknown" };
    }
    const result = approvedSignIns(sheet, values);
    if (!result.ok) {
      return { kind: "settingsInvalid", problems: result.error };
    }
    // `approvedSignIns` fills in every sign-in the sheet has, and the sheet has this one.
    return { kind: "approvable", signIn: result.value[signIn] as ApprovedSignIn };
  }

  const managed = createSignInTokens({
    integration: settings.integration,
    grants: settings.grants,
    http: settings.http,
    secrets: settings.secrets,
    clock: settings.clock,
    async resolveSignIn(signIn) {
      const found = await lookUp(signIn);
      return found.kind === "approvable" ? found.signIn : undefined;
    },
    requestSignal: settings.requestSignal,
  });

  return {
    tokens: refusingWhileSigningOut(managed, signingOut),
    lookUp,
    signOut(signIn) {
      // A second call while one runs gets the same sign-out, so the server is asked once.
      const running = signingOut.get(signIn);
      if (running) {
        return running;
      }
      const started = signOutAfterRefresh(signIn).finally(() => signingOut.delete(signIn));
      signingOut.set(signIn, started);
      return started;
    },
  };

  async function signOutAfterRefresh(signIn: string): Promise<SignOutResult> {
    await managed.settled(signIn);
    const result = await signOutAtServer(signOutSettings(settings), signIn);
    managed.forget(signIn);
    return result;
  }
}

function signOutSettings(settings: IntegrationSignInsSettings): SignOutSettings {
  return {
    integration: settings.integration,
    grants: settings.grants,
    http: settings.http,
    secrets: settings.secrets,
    requestSignal: settings.requestSignal,
  };
}

/** The kit's view of the tokens, without `forget` and `settled`, which are for Halonic's side only. */
function refusingWhileSigningOut(
  managed: ManagedSignInTokens,
  signingOut: ReadonlyMap<string, unknown>,
): SignInTokens {
  return {
    access(signIn, signal) {
      if (signingOut.has(signIn)) {
        return Promise.reject(new SignInNeededError(signIn));
      }
      return managed.access(signIn, signal);
    },
    rejected: (signIn, value) => managed.rejected(signIn, value),
    filterValues: () => managed.filterValues(),
  };
}
