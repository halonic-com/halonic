import {
  AgentHostError,
  type AgentHostServerEngine,
  type ServerAccessInput,
  type ServerAccessSaved,
  type ServerEngineLeft,
  type ServerEngineState,
  type ServerPairStart,
  type ServerPairState,
} from "@halonicjs/adapter-agent-host-client";
import { type ServiceKey, serviceKey } from "@halonicjs/studio-shell";

export type { ServerAccessSaved, ServerEngineLeft, ServerPairStart, ServerPairState };

/** The Cloudflare Access service token a server's access check wants, as typed. */
export type ServerAccess = ServerAccessInput;

/**
 * Where the workspace's messaging runs, as Settings › Connections shows it: the host's answer, or
 * `keychain-needed` when the host has no keychain, so the server engine can't be chosen here.
 */
export type ServerEngineView = ServerEngineState | { readonly engine: "keychain-needed" };

/**
 * The workspace's messaging engine and its pairing with a server (`services.server-engine`), as
 * the Connections feature uses it. No answer holds the device token: the host keeps it in the
 * keychain (`agent-host.server-engine-pairing`).
 */
export interface ServerEngine {
  /** The workspace's engine, read again on each call. */
  state(): Promise<ServerEngineView>;
  /**
   * Asks the server at `address` to pair with the code its owner gave, as `deviceName`, with the
   * Access service token its access check wants when there is one.
   */
  pair(
    address: string,
    code: string,
    deviceName: string,
    access?: ServerAccess,
  ): Promise<ServerPairStart>;
  /** Sets, or with `undefined` clears, the Access service token kept for the pairing. */
  setAccess(access: ServerAccess | undefined): Promise<ServerAccessSaved>;
  /** Asks once where the pairing stands. */
  status(pairingId: string): Promise<ServerPairState>;
  /** Asks the server to drop the request: whether it did. */
  cancel(pairingId: string): Promise<boolean>;
  /** Back to "This computer": ends the pairing on the server when it can, and forgets it here. */
  useThisComputer(): Promise<ServerEngineLeft>;
}

/**
 * The agent host's server engine, with the host's 409 `keychain_needed` on `state` read as the
 * `keychain-needed` engine. Every other refusal rejects as it came.
 */
export function hostServerEngine(engine: AgentHostServerEngine): ServerEngine {
  return {
    state: () =>
      engine.state().catch((error: unknown) => {
        if (error instanceof AgentHostError && error.kind === "keychain_needed") {
          return { engine: "keychain-needed" } as const;
        }
        throw error;
      }),
    pair: (address, code, deviceName, access) => engine.pair(address, code, deviceName, access),
    setAccess: (access) => engine.setAccess(access),
    status: (pairingId) => engine.status(pairingId),
    cancel: (pairingId) => engine.cancel(pairingId),
    useThisComputer: () => engine.useThisComputer(),
  };
}

/**
 * How Settings › Connections reaches the server engine. Provided where an agent host serves the
 * workspace; elsewhere nothing provides it and the Messaging engine row doesn't show.
 */
export const ServerEngineService: ServiceKey<ServerEngine> =
  serviceKey<ServerEngine>("server-engine");
