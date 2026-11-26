import { ServerAgentMessaging } from "@halonicjs/host-server";
import { type AgentMessaging, type SecretStore, serverPairingSecretName } from "@halonicjs/ports";
import type { MessagingEngineSetting } from "./messaging-engine-setting.ts";
import { ServerReach } from "./server-reach.ts";

/**
 * Each workspace's device token for its server, in the OS keychain under
 * `server-pairing__<workspace key>` (`agent-host.keychain-secrets`). Without
 * a keychain (`halonic serve`, a headless Linux) there are no pairings: a
 * token never goes to the profile's secrets file.
 */
export class ServerPairings {
  readonly #keychain: SecretStore | undefined;

  /** @param keychain - the host's own secrets in the keychain, or `undefined` without one */
  constructor(keychain: SecretStore | undefined) {
    this.#keychain = keychain;
  }

  /**
   * The workspace's device token, or `undefined` when it has none.
   *
   * @throws the keychain's error when it can't be read
   */
  async token(workspaceKey: string): Promise<string | undefined> {
    if (this.#keychain === undefined) return undefined;
    return (await this.#keychain.get(serverPairingSecretName(workspaceKey))) ?? undefined;
  }
}

/**
 * What a workspace's messaging joins: the local Paperclip connections, or
 * one server. A server without a token it can use is joined as nothing, so
 * its stand-in reads as signed out and Paperclip's connections stay unjoined.
 */
export type JoinedEngine =
  | { kind: "this-computer" }
  | { kind: "server"; address: string; messaging: AgentMessaging | undefined; reach: ServerReach };

/** What {@link joinedEngineOf} reads with. */
export interface ServerEngineOptions {
  setting: MessagingEngineSetting;
  pairings: ServerPairings;
  /** Says why a server engine reads as signed out; never a token. */
  warn: (message: string) => void;
  /** The `fetch` the server client sends with; the global one by default. */
  fetch?: typeof fetch;
  now?: () => Date;
}

/**
 * The engine a workspace's messaging joins (`agent-host.messaging-engine`):
 * its setting in the profile, and for "Server" the device token from the
 * keychain, given to one {@link ServerAgentMessaging}.
 *
 * @param workspace - the workspace's real path, as the launcher named it
 */
export async function joinedEngineOf(
  workspace: string,
  options: ServerEngineOptions,
): Promise<JoinedEngine> {
  const { key, engine } = await options.setting.read(workspace);
  if (engine.kind === "this-computer") return engine;
  const { address } = engine;
  const reach = new ServerReach(options.now);
  let token: string | undefined;
  try {
    token = await options.pairings.token(key);
  } catch (error) {
    options.warn(
      `This computer's pairing with ${address} couldn't be read (${errorName(error)}), ` +
        `so its messaging is signed out.`,
    );
    return { kind: "server", address, messaging: undefined, reach };
  }
  if (token === undefined) return { kind: "server", address, messaging: undefined, reach };
  try {
    const { fetch: send = globalThis.fetch, now } = options;
    const messaging = new ServerAgentMessaging({
      address,
      token,
      label: new URL(address).host,
      fetch: reach.watch((request) => send(request)),
      ...(now === undefined ? {} : { now }),
    });
    return { kind: "server", address, messaging, reach };
  } catch (error) {
    // The client names the reason only (a token a header can't carry), never the token.
    options.warn(`The pairing with ${address} can't be used (${errorName(error)}).`);
    return { kind: "server", address, messaging: undefined, reach };
  }
}

/** What the routes answer, with 409, for Connect or Disconnect while the engine is a server. */
export const serverEngineMessage =
  "This workspace's messaging runs on a server. Switch it to This computer to connect Paperclip here.";

/**
 * Connect or Disconnect of a local Paperclip connection while the
 * workspace's engine is a server: the routes answer 409 `server_engine`.
 */
export class ServerEngineInUse extends Error {
  override name = "ServerEngineInUse";

  constructor() {
    super(serverEngineMessage);
  }
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "Error";
}
