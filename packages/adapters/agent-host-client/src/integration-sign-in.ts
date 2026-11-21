import { type Schema, s } from "@halonicjs/schema-kit";
import { type AgentHostTransport, answerError, readAnswer } from "./transport.ts";

/**
 * Where one sign-in of an integration stands, in the host's own word.
 * - `signedIn`: a grant is saved for the sign-in the sheet and the settings describe now.
 * - `signedOut`: no grant is saved.
 * - `approvalChanged`: the saved grant is for another sign-in than the one described now; signing in again replaces it.
 * - `cannotSignIn`: a setting the sign-in reads is missing or wrong.
 */
export type IntegrationSignInState = "signedIn" | "signedOut" | "approvalChanged" | "cannotSignIn";

/** How a sign-in ended without a grant, with nothing more to say than its kind. */
export type IntegrationSignInFailure =
  | "cancelled"
  | "incompleteCallback"
  | "linkNoLongerValid"
  | "issuerMismatch"
  | "signInChanged"
  | "clientSecretMissing"
  | "wrongClientSecret"
  | "codeRefused"
  | "noRefreshToken"
  | "tokenAnswerRefused"
  | "unreachable"
  | "failed";

/**
 * How the last sign-in ended, as the host keeps it. None holds a code, a
 * token, the provider's error description or the client secret.
 */
export type IntegrationSignInOutcome = { readonly signIn: string } & (
  | {
      readonly kind: "signedIn";
      /** Scopes the person was asked for and the provider didn't grant. */
      readonly missingScopes: readonly string[];
      /** Scopes the provider granted beyond the ones asked for. */
      readonly extraScopes: readonly string[];
      /** What became of the grant this sign-in replaced, when there was one. */
      readonly previousGrant?: "revoked" | "notConfirmed" | "noRevokeUrl" | "skipped" | undefined;
    }
  | { readonly kind: IntegrationSignInFailure }
  | { readonly kind: "providerError"; readonly errorCode: string }
  | { readonly kind: "unexpectedAnswer"; readonly status: number }
);

/** One sign-in of an integration's sheet, as Studio shows it. */
export interface IntegrationSignInStatus {
  readonly signIn: string;
  readonly state: IntegrationSignInState;
  /** How the last sign-in ended since the host started, if one did. */
  readonly lastOutcome?: IntegrationSignInOutcome | undefined;
}

/**
 * How a sign-out ended. The grant is gone in every `signedOut` case; `revoke`
 * says whether the provider confirmed (`revoked`), didn't (`notConfirmed`),
 * has no revoke address (`noRevokeUrl`) or wasn't asked (`skipped`).
 */
export type IntegrationSignOutResult =
  | { readonly kind: "notSignedIn" }
  | {
      readonly kind: "signedOut";
      readonly revoke: "revoked" | "notConfirmed" | "noRevokeUrl" | "skipped";
    };

const outcomeSchema: Schema<IntegrationSignInOutcome> = s.union([
  s
    .object({
      kind: s.literal("signedIn"),
      signIn: s.string(),
      missingScopes: s.array(s.string()),
      extraScopes: s.array(s.string()),
      previousGrant: s.enum(["revoked", "notConfirmed", "noRevokeUrl", "skipped"]).optional(),
    })
    .strict(),
  s
    .object({
      kind: s.enum([
        "cancelled",
        "incompleteCallback",
        "linkNoLongerValid",
        "issuerMismatch",
        "signInChanged",
        "clientSecretMissing",
        "wrongClientSecret",
        "codeRefused",
        "noRefreshToken",
        "tokenAnswerRefused",
        "unreachable",
        "failed",
      ]),
      signIn: s.string(),
    })
    .strict(),
  s
    .object({ kind: s.literal("providerError"), signIn: s.string(), errorCode: s.string() })
    .strict(),
  s
    .object({ kind: s.literal("unexpectedAnswer"), signIn: s.string(), status: s.number() })
    .strict(),
]);

const statusSchema = s
  .object({
    signIns: s.array(
      s
        .object({
          signIn: s.string(),
          state: s.enum(["signedIn", "signedOut", "approvalChanged", "cannotSignIn"]),
          lastOutcome: outcomeSchema.optional(),
        })
        .strict(),
    ),
  })
  .strict();

const startedSchema = s.object({ authorizeUrl: s.string() }).strict();

const signOutResultSchema: Schema<IntegrationSignOutResult> = s.union([
  s.object({ kind: s.literal("notSignedIn") }).strict(),
  s
    .object({
      kind: s.literal("signedOut"),
      revoke: s.enum(["revoked", "notConfirmed", "noRevokeUrl", "skipped"]),
    })
    .strict(),
]);

const signedOutSchema = s.object({ result: signOutResultSchema }).strict();

const signedOutAllSchema = s
  .object({
    signedOut: s.array(s.object({ signIn: s.string(), result: signOutResultSchema }).strict()),
  })
  .strict();

/** One sign-in that {@link AgentHostIntegrationSignIns.signOutAll} signed out, and how. */
export interface IntegrationSignedOut {
  readonly signIn: string;
  readonly result: IntegrationSignOutResult;
}

/**
 * The page's way to an integration's sign-ins. The agent host runs the
 * sign-in and keeps the grant; the page sends only the integration's and the
 * sign-in's names and never sends or reads a code, a token or a client secret.
 */
export class AgentHostIntegrationSignIns {
  readonly #transport: AgentHostTransport;

  constructor(transport: AgentHostTransport) {
    this.#transport = transport;
  }

  /**
   * Where each sign-in of the integration stands.
   *
   * @throws {@link AgentHostError} when the host can't be reached or refuses (`unknown_integration`, `sign_in_failed`)
   */
  async status(integration: string): Promise<readonly IntegrationSignInStatus[]> {
    const route = "POST /v1/integrations/sign-in/status";
    const answer = await this.#transport.request(route, { integration });
    return readAnswer(route, answer, statusSchema).signIns;
  }

  /**
   * Starts a sign-in. The provider sends the browser back to the host's own port.
   *
   * @returns the address to open in the browser; it holds no secret
   * @throws {@link AgentHostError} when the host can't be reached or refuses (`unknown_integration`, `unknown_sign_in`, `settings_invalid`, `client_secret_missing`, `callback_unavailable`, `sign_in_failed`)
   */
  async start(integration: string, signIn: string): Promise<string> {
    const route = "POST /v1/integrations/sign-in/start";
    const answer = await this.#transport.request(route, { integration, signIn });
    return readAnswer(route, answer, startedSchema).authorizeUrl;
  }

  /**
   * Drops the pending sign-in, so a callback that still arrives is refused. It
   * succeeds whether or not one was pending.
   *
   * @throws {@link AgentHostError} when the host can't be reached or refuses (`unknown_integration`)
   */
  async cancel(integration: string, signIn: string): Promise<void> {
    const route = "POST /v1/integrations/sign-in/cancel";
    const answer = await this.#transport.request(route, { integration, signIn });
    if (answer.status !== 204) throw answerError(route, answer);
  }

  /**
   * Revokes at the address the person approved, then removes the grant, also
   * when the provider doesn't confirm.
   *
   * @throws {@link AgentHostError} when the host can't be reached or refuses (`unknown_integration`, `sign_in_failed`)
   */
  async signOut(integration: string, signIn: string): Promise<IntegrationSignOutResult> {
    const route = "POST /v1/integrations/sign-in/sign-out";
    const answer = await this.#transport.request(route, { integration, signIn });
    return readAnswer(route, answer, signedOutSchema).result;
  }

  /**
   * Signs out every sign-in of the integration that has a saved grant, also
   * one its sheet no longer names or a plugin the trust no longer covers:
   * each is revoked where it can be and its grant removed. Studio calls it
   * when it removes a plugin's trust or the plugin.
   *
   * @returns each sign-in signed out and how; none for an integration the host runs no sign-ins for
   * @throws {@link AgentHostError} when the host can't be reached or refuses (`sign_in_failed`)
   */
  async signOutAll(integration: string): Promise<readonly IntegrationSignedOut[]> {
    const route = "POST /v1/integrations/sign-in/sign-out-all";
    const answer = await this.#transport.request(route, { integration });
    return readAnswer(route, answer, signedOutAllSchema).signedOut;
  }
}
