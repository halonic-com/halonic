import { type Infer, s } from "@halonicjs/schema-kit";
import { type AgentHostTransport, readAnswer } from "./transport.ts";

const stateAnswer = s.discriminatedUnion("engine", [
  s.object({ engine: s.literal("this-computer"), computerName: s.string().optional() }).strict(),
  s
    .object({
      engine: s.literal("server"),
      address: s.string(),
      pairing: s.enum(["kept", "missing", "unreadable"]),
      computerName: s.string().optional(),
      sessionEndsAt: s.string().optional(),
      server: s
        .object({
          state: s.enum(["online", "offline", "signed-out"]),
          checkedAt: s.string(),
        })
        .strict()
        .optional(),
    })
    .strict(),
]);

const tooMany = s
  .object({ state: s.literal("too_many"), minutes: s.number().int().positive().optional() })
  .strict();

const pairAnswer = s.discriminatedUnion("state", [
  s
    .object({
      state: s.literal("waiting"),
      pairingId: s.string(),
      checkCode: s.string(),
      expiresAt: s.string(),
    })
    .strict(),
  tooMany,
  s
    .object({
      state: s.enum(["address_not_allowed", "unreachable", "not_halonic", "code_refused", "lost"]),
    })
    .strict(),
]);

const statusAnswer = s.discriminatedUnion("state", [
  s.object({ state: s.literal("waiting"), expiresAt: s.string() }).strict(),
  s.object({ state: s.literal("paired"), sessionEndsAt: s.string() }).strict(),
  s.object({ state: s.literal("key_not_saved"), signedOut: s.boolean() }).strict(),
  tooMany,
  s
    .object({
      state: s.enum([
        "expired",
        "refused",
        "cancelled",
        "taken-over",
        "lost",
        "unreachable",
        "not_halonic",
        "code_refused",
      ]),
    })
    .strict(),
]);

const cancelAnswer = s.object({ cancelled: s.boolean() }).strict();

const thisComputerAnswer = s
  .object({ stillValid: s.boolean(), keychainEntryKept: s.literal(true).optional() })
  .strict();

/**
 * Where the workspace's messaging runs, this computer's name, and on a server the pairing's end,
 * whether the keychain holds it and whether the server answered it just now.
 */
export type ServerEngineState = Infer<typeof stateAnswer>;

/** How starting a pairing went: waiting with the check code, or why it didn't start. */
export type ServerPairStart = Infer<typeof pairAnswer>;

/** Where a pairing stands; only `paired` switched the workspace to the server. */
export type ServerPairState = Infer<typeof statusAnswer>;

/** What switching back did: the setting is "This computer" either way. */
export type ServerEngineLeft = Infer<typeof thisComputerAnswer>;

/**
 * The page's way to the agent host's server engine pairing
 * (`agent-host-client.server-engine`). The host calls the server and keeps
 * the device token in the keychain; no answer here holds it. A host without
 * a keychain refuses every call with 409 `keychain_needed`.
 */
export class AgentHostServerEngine {
  readonly #transport: AgentHostTransport;
  readonly #workspace: string;

  /** @param workspace - the open workspace's real path */
  constructor(transport: AgentHostTransport, workspace: string) {
    this.#transport = transport;
    this.#workspace = workspace;
  }

  /** The workspace's engine. @throws {@link AgentHostError} when the host refuses */
  async state(): Promise<ServerEngineState> {
    const route = "POST /v1/messaging/server-engine/state";
    const answer = await this.#transport.request(route, { workspace: this.#workspace });
    return readAnswer(route, answer, stateAnswer);
  }

  /** Asks the server at `address` to pair with the code its owner gave, as `deviceName`. */
  async pair(address: string, code: string, deviceName: string): Promise<ServerPairStart> {
    const route = "POST /v1/messaging/server-engine/pair";
    const body = { workspace: this.#workspace, address, code, deviceName };
    return readAnswer(route, await this.#transport.request(route, body), pairAnswer);
  }

  /** Asks once where the pairing stands. */
  async status(pairingId: string): Promise<ServerPairState> {
    const route = "POST /v1/messaging/server-engine/pair-status";
    return readAnswer(route, await this.#transport.request(route, { pairingId }), statusAnswer);
  }

  /** Asks the server to drop the request: whether it did, so the page can say when it couldn't. */
  async cancel(pairingId: string): Promise<boolean> {
    const route = "POST /v1/messaging/server-engine/pair-cancel";
    const answer = await this.#transport.request(route, { pairingId });
    return readAnswer(route, answer, cancelAnswer).cancelled;
  }

  /** Back to "This computer": ends the pairing on the server when it can, and forgets it here. */
  async useThisComputer(): Promise<ServerEngineLeft> {
    const route = "POST /v1/messaging/server-engine/use-this-computer";
    const answer = await this.#transport.request(route, { workspace: this.#workspace });
    return readAnswer(route, answer, thisComputerAnswer);
  }
}
