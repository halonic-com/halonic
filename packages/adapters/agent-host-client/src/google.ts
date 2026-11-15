import { s } from "@halonicjs/schema-kit";
import { type AgentHostTransport, readAnswer } from "./transport.ts";

const disconnectedSchema = s
  .object({
    disconnected: s.literal(true),
    googleConfirmed: s.boolean(),
    clientSecret: s.string(),
  })
  .strict();

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
}
