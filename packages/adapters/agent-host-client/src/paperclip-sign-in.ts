import type { MessagingId, MessagingSourceState } from "@halonicjs/ports";
import { type Infer, s } from "@halonicjs/schema-kit";
import { type AgentHostTransport, readAnswer } from "./transport.ts";

const sourceState = s.discriminatedUnion("kind", [
  s.object({ kind: s.literal("online"), asOf: s.string() }).strict(),
  s.object({ kind: s.literal("offline"), asOf: s.string() }).strict(),
  s.object({ kind: s.literal("signed-out") }).strict(),
]);

const connectionsAnswer = s
  .object({
    connections: s.array(
      s
        .object({
          id: s.string(),
          name: s.string(),
          label: s.string(),
          address: s.string(),
          state: sourceState,
          userName: s.string().optional(),
        })
        .strict(),
    ),
  })
  .strict();

const startAnswer = s.discriminatedUnion("outcome", [
  s
    .object({
      outcome: s.literal("started"),
      signInId: s.string(),
      phrase: s.string(),
      approvalUrl: s.string(),
      expiresAt: s.string(),
    })
    .strict(),
  s
    .object({
      outcome: s.literal("refused"),
      reason: s.enum(["address-not-allowed", "unreachable", "too-many-sign-ins"]),
    })
    .strict(),
]);

const stateAnswer = s.discriminatedUnion("status", [
  s.object({ status: s.literal("pending") }).strict(),
  s
    .object({
      status: s.literal("connected"),
      connection: s.string(),
      address: s.string(),
      company: s.string(),
      key: s.string(),
    })
    .strict(),
  s.object({ status: s.literal("cancelled"), keyMayWork: s.literal(true).optional() }).strict(),
  s.object({ status: s.literal("expired"), keyMayWork: s.literal(true).optional() }).strict(),
  s.object({ status: s.literal("wrong-company") }).strict(),
  s.object({ status: s.literal("unknown") }).strict(),
]);

const confirmAnswer = s.object({ confirmed: s.boolean() }).strict();

/** One of the workspace's Paperclip connection files, as Settings › Connections lists it. */
export interface PaperclipConnectionRow {
  readonly id: MessagingId;
  /** The file name without `.yaml`. */
  readonly name: string;
  /** "Paperclip · Halonic", with whom it is signed in as once known: "Paperclip · Halonic · Board Supervisor". */
  readonly label: string;
  readonly address: string;
  readonly state: MessagingSourceState;
  /** The Paperclip user the connection is signed in as, once the engine read it. */
  readonly userName?: string | undefined;
}

/** How starting a sign-in went. */
export type PaperclipSignInStart = Infer<typeof startAnswer>;

/**
 * Where a sign-in stands. Only the first `connected` answer holds the key, for
 * Studio's keychain, and it is the sign-in's last answer.
 */
export type PaperclipSignInState = Infer<typeof stateAnswer>;

/**
 * The page's way to the agent host's Paperclip sign-in and the workspace's
 * connections (`agent-host.paperclip-sign-in`). The host makes every call to
 * Paperclip; this only names the workspace, the address and the sign-in.
 */
export class AgentHostPaperclipSignIn {
  readonly #transport: AgentHostTransport;
  readonly #workspace: string;

  /** @param workspace - the open workspace's real path */
  constructor(transport: AgentHostTransport, workspace: string) {
    this.#transport = transport;
    this.#workspace = workspace;
  }

  /** The workspace's connection files with their states; never a key. */
  async connections(): Promise<readonly PaperclipConnectionRow[]> {
    const route = "POST /v1/paperclip/connections";
    const answer = await this.#transport.request(route, { workspace: this.#workspace });
    return readAnswer(route, answer, connectionsAnswer).connections;
  }

  /**
   * Starts a sign-in at `address`, for the connection named `connection`, or
   * for the file with that address, or a new connection. With
   * `newConnection`, it is always for a new connection: another account on
   * the same Paperclip (`agent-host.paperclip-add-account`).
   *
   * @throws {@link AgentHostError} when the host refuses or can't be reached
   */
  async start(
    address: string,
    connection?: string,
    options: { readonly newConnection?: boolean } = {},
  ): Promise<PaperclipSignInStart> {
    const route = "POST /v1/paperclip/sign-in/start";
    const body = {
      workspace: this.#workspace,
      address,
      ...(connection === undefined ? {} : { connection }),
      ...(options.newConnection === true ? { newConnection: true } : {}),
    };
    return readAnswer(route, await this.#transport.request(route, body), startAnswer);
  }

  /** Polls a sign-in once. */
  async poll(signInId: string): Promise<PaperclipSignInState> {
    const route = "POST /v1/paperclip/sign-in/poll";
    return readAnswer(route, await this.#transport.request(route, { signInId }), stateAnswer);
  }

  /**
   * Says the keychain has the key the approved poll answered. Until then the
   * host keeps the sign-in, and revokes the key after a minute.
   *
   * @returns whether the host still had the sign-in; `false` means it revoked the key already
   */
  async confirm(signInId: string): Promise<boolean> {
    const route = "POST /v1/paperclip/sign-in/confirm";
    const answer = await this.#transport.request(route, { signInId });
    return readAnswer(route, answer, confirmAnswer).confirmed;
  }

  /**
   * Ends a sign-in: the host cancels its challenge and drops the key. After
   * the approved answer, the host revokes the key and undoes the sign-in.
   */
  async cancel(signInId: string): Promise<PaperclipSignInState> {
    const route = "POST /v1/paperclip/sign-in/cancel";
    return readAnswer(route, await this.#transport.request(route, { signInId }), stateAnswer);
  }
}
