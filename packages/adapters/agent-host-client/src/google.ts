import { type Schema, s } from "@halonicjs/schema-kit";
import {
  type AgentHostAnswer,
  type AgentHostRequestRoute,
  type AgentHostTransport,
  answerError,
  checked,
  readAnswer,
} from "./transport.ts";

const disconnectedSchema = s
  .object({
    disconnected: s.literal(true),
    googleConfirmed: s.boolean(),
    clientSecret: s.string(),
  })
  .strict();

const startedSchema = s.object({ accountRef: s.string() }).strict();
const updatedSchema = s.object({ updated: s.literal(true) }).strict();
const startedOverSchema = s.object({ clientSecret: s.string(), accountRef: s.string() }).strict();
const signInSchema = s.object({ authUrl: s.string() }).strict();
const savedSchema = s.object({ saved: s.literal(true) }).strict();

const secretReplacedSchema: Schema<GoogleSecretReplaced> = s.union([
  s.object({ result: s.literal("accepted"), accountsFixed: s.array(s.string()) }).strict(),
  s
    .object({
      result: s.enum([
        "replaced",
        "refused",
        "signInRefused",
        "nothingStaged",
        "notSignedIn",
        "unreachable",
        "googleError",
        "unexpectedAnswer",
      ]),
    })
    .strict(),
]);

/** What a secret field holds: only the request that sends it asks for the text. Studio's `SecretText` is one. */
export interface RevealableSecret {
  reveal(): string;
}

/** The ways a check of a new client secret ends without Google accepting or refusing it. */
export type GoogleSecretCheckUnfinished =
  | "signInRefused"
  | "nothingStaged"
  | "notSignedIn"
  | "unreachable"
  | "googleError"
  | "unexpectedAnswer";

/**
 * How replacing a client secret ended, in the host's own words; it holds no secret.
 * - `replaced`: nothing used the old secret, so the new one is in place without a check.
 * - `accepted`: Google accepted the new secret; it is in use, and `accountsFixed` lists the
 *   accounts it fixed.
 * - `refused`: Google refused the new secret; the old one stays.
 * - `signInRefused`: Google refused the account's sign-in, so the secret wasn't tested; it
 *   stays staged and the old one stays in use.
 * - the rest: the check couldn't finish; both secrets are as they were.
 */
export type GoogleSecretReplaced =
  | { readonly result: "accepted"; readonly accountsFixed: readonly string[] }
  | { readonly result: "replaced" | "refused" | GoogleSecretCheckUnfinished };

/** Which kind of Google account a setup is for. */
export type GoogleAccountType = "workspace" | "personal";

/** The connector a setup is for: the workspace's key in the profile and the connector's id. */
export interface GoogleConnectorLink {
  readonly workspace: string;
  readonly id: string;
}

/**
 * The body of `status`, checked against `schema`. The host answers 201 to a start and 204 to
 * a cancel, so these routes can't use {@link readAnswer}, which takes only 200.
 *
 * @throws {@link AgentHostError} for any other status, or a body of another shape
 */
function readStatus<T>(
  route: AgentHostRequestRoute,
  answer: AgentHostAnswer,
  status: number,
  schema: Schema<T>,
): T {
  if (answer.status !== status) throw answerError(route, answer);
  return checked(route, answer.body, schema);
}

/** How a disconnect ended; it holds no token and no secret. */
export interface GoogleDisconnected {
  /** Whether Google answered that it ended the sign-in. When false, access can still be removed in the Google account. */
  readonly googleConfirmed: boolean;
  /** What became of the client secret, in the host's own word, such as `removed` or `kept-for-other-accounts`. */
  readonly clientSecret: string;
}

/**
 * The page's way to change a Google setup. The page can read the setup records
 * but holds no token and no client secret, so the agent host, which sealed
 * them, does the change.
 */
export class AgentHostGoogleSetup {
  readonly #transport: AgentHostTransport;

  constructor(transport: AgentHostTransport) {
    this.#transport = transport;
  }

  /**
   * Asks Google to end the account's sign-in, then removes the sign-in, the
   * record and the client secret (unless another account uses the client),
   * even when Google can't be reached.
   *
   * @throws {@link AgentHostError} when the host can't be reached or refuses (`google_setup_not_found`, `google_failed`); some of it may still have been removed, so read the accounts again
   */
  async disconnect(accountRef: string): Promise<GoogleDisconnected> {
    const route = "POST /v1/google/disconnect";
    const answer = await this.#transport.request(route, { accountRef });
    const { googleConfirmed, clientSecret } = readAnswer(route, answer, disconnectedSchema);
    return { googleConfirmed, clientSecret };
  }

  /**
   * Starts a setup record for a connector, which keeps the link to it.
   *
   * @returns the new record's ref
   * @throws {@link AgentHostError} when the host can't be reached or refuses (`google_failed`)
   */
  async start(connector: GoogleConnectorLink, accountType: GoogleAccountType): Promise<string> {
    const route = "POST /v1/google/setups";
    const answer = await this.#transport.request(route, { accountType, connector });
    return readStatus(route, answer, 201, startedSchema).accountRef;
  }

  /**
   * Applies one change a person makes to the setup. The host refuses a change that says the
   * account signed in, saved a secret or passed a check, because only the host records those.
   *
   * @throws {@link AgentHostError} when the host can't be reached or refuses (`google_setup_not_found`, `google_failed`)
   */
  async edit(accountRef: string, change: Readonly<Record<string, unknown>>): Promise<void> {
    const route = "POST /v1/google/setups/edit";
    const answer = await this.#transport.request(route, { accountRef, change });
    readAnswer(route, answer, updatedSchema);
  }

  /**
   * Removes the record, the refresh token and the client secret (not while another account
   * uses the client), without asking Google, and starts a fresh record for the same connector
   * in the same step.
   *
   * @returns what became of the client secret, in the host's own word, and the fresh record's ref
   * @throws {@link AgentHostError} when the host can't be reached or refuses (`google_setup_not_found`, `google_failed`)
   */
  async startOver(
    accountRef: string,
  ): Promise<{ readonly clientSecret: string; readonly accountRef: string }> {
    const route = "POST /v1/google/start-over";
    const answer = await this.#transport.request(route, { accountRef });
    return readAnswer(route, answer, startedOverSchema);
  }

  /**
   * Starts the account's sign-in. Google's answer comes back to the host's own port.
   *
   * @returns the address to open in the browser; it holds no secret
   * @throws {@link AgentHostError} when the host can't be reached or refuses (`google_setup_not_found`, `google_failed`)
   */
  async startSignIn(accountRef: string): Promise<string> {
    const route = "POST /v1/google/sign-in";
    const answer = await this.#transport.request(route, { accountRef });
    return readAnswer(route, answer, signInSchema).authUrl;
  }

  /**
   * Drops the account's pending sign-in, so a callback that still arrives is refused. It
   * succeeds whether or not one was pending.
   *
   * @throws {@link AgentHostError} when the host can't be reached or refuses
   */
  async cancelSignIn(accountRef: string): Promise<void> {
    const route = "POST /v1/google/sign-in/cancel";
    const answer = await this.#transport.request(route, { accountRef });
    if (answer.status !== 204) throw answerError(route, answer);
  }

  /**
   * Keeps a client secret for an account that has none. The secret goes to the host once, in
   * this request, and the host stores it; the page never holds it again.
   *
   * @throws {@link AgentHostError} when the host can't be reached or refuses (`google_setup_not_found`, `secret_needs_staging` when the account's secret is in use and {@link replaceClientSecret} is the way, `google_failed`)
   */
  async saveClientSecret(accountRef: string, secret: RevealableSecret): Promise<void> {
    const route = "POST /v1/google/secret";
    const answer = await this.#transport.request(route, {
      accountRef,
      clientSecret: secret.reveal(),
    });
    readAnswer(route, answer, savedSchema);
  }

  /**
   * Replaces the account's client secret. When Google has never been asked to use the old one,
   * the new one takes its place; otherwise the host checks it with Google first, and an old
   * secret is never replaced by one Google refused.
   *
   * @returns how it ended; see {@link GoogleSecretReplaced}
   * @throws {@link AgentHostError} when the host can't be reached or refuses (`google_setup_not_found`, `google_failed`); the old secret is still in use
   */
  async replaceClientSecret(
    accountRef: string,
    secret: RevealableSecret,
  ): Promise<GoogleSecretReplaced> {
    const route = "POST /v1/google/secret/replace";
    const answer = await this.#transport.request(route, {
      accountRef,
      clientSecret: secret.reveal(),
    });
    return readAnswer(route, answer, secretReplacedSchema);
  }
}
