import { createServer as createHttpServer } from "node:http";
import { networkInterfaces } from "node:os";
import type { Server } from "@halonicjs/host-server";
import { answerRequest } from "./http-bridge.ts";
import { findLanAddress, type NetworkInterfaces } from "./lan-address.ts";

/** `network: true` was asked for without a password. */
export class NetworkNeedsPasswordError extends Error {
  constructor() {
    super(
      "Serving on your home network needs a password, so nobody else on it can open your workspace. Set one with `halonic secret set serve-password`, then start again.",
    );
    this.name = "NetworkNeedsPasswordError";
  }
}

/** `publicOrigin` was given without a password. */
export class PublicOriginNeedsPasswordError extends Error {
  constructor() {
    super(
      "Serving at a public address needs a password, so nobody on the internet can open your workspace. Set one with `halonic secret set serve-password`, then start again.",
    );
    this.name = "PublicOriginNeedsPasswordError";
  }
}

/** `network: true` was asked for on a computer with no network address. */
export class NoNetworkAddressError extends Error {
  constructor() {
    super("This computer has no network address, so it can't serve on your home network.");
    this.name = "NoNetworkAddressError";
  }
}

/** What {@link listenOnNode} needs. */
export interface ListenOptions {
  /**
   * Builds the server for the `Host` names it must answer to, besides the
   * loopback names that always work. The runtime knows them only once it knows
   * the port and the LAN address.
   */
  readonly createServer: (allowedHosts: readonly string[]) => Server;
  /** The port; `0` lets the system choose, which is only for tests and loopback use. */
  readonly port: number;
  /** Also listen on the home network. Needs `passwordIsSet`. */
  readonly network: boolean;
  /**
   * The `https` origin a proxy on this computer serves the server under. The
   * server then answers to that host only, so `createServer` gets just it.
   * Needs `passwordIsSet`, and can't go with `network`.
   */
  readonly publicOrigin?: string;
  /** Whether a sign-in password is set. */
  readonly passwordIsSet: boolean;
  /** Where the line for the phone goes; the CLI prints it. */
  readonly report: (line: string) => void;
  /** Where the cause of a failed request goes. The client only gets an empty 500. */
  readonly logError: (error: unknown) => void;
  /** The computer's network interfaces; `os.networkInterfaces()` by default. */
  readonly interfaces?: NetworkInterfaces;
}

/** A running listener. */
export interface Listening {
  /** The address it is bound to: `127.0.0.1`, or `0.0.0.0` on the network. */
  readonly host: string;
  /** The port it listens on. */
  readonly port: number;
  /** Stops listening and ends open connections. */
  close(): Promise<void>;
}

/**
 * Refuses what {@link listenOnNode} must not start, before anything binds.
 *
 * @returns the LAN address to also serve on with `network`, otherwise `undefined`
 */
function checkedLanAddress(options: ListenOptions): string | undefined {
  if (options.publicOrigin !== undefined) {
    // A proxy on this computer is the only way in, so the listener stays on loopback.
    if (options.network) throw new RangeError("publicOrigin can't go with network");
    if (!options.passwordIsSet) throw new PublicOriginNeedsPasswordError();
  }
  if (!options.network) return undefined;
  if (!options.passwordIsSet) throw new NetworkNeedsPasswordError();
  const lanAddress = findLanAddress(options.interfaces ?? networkInterfaces());
  if (lanAddress === undefined) throw new NoNetworkAddressError();
  return lanAddress;
}

/**
 * Serves `createServer`'s handler over HTTP. It binds to `127.0.0.1` only,
 * unless `network` is set, which needs a password.
 *
 * @throws RangeError when both `network` and `publicOrigin` are set
 * @throws PublicOriginNeedsPasswordError when `publicOrigin` is set and no password is
 * @throws NetworkNeedsPasswordError when `network` is set and no password is
 * @throws NoNetworkAddressError when `network` is set and there is no LAN address
 */
export async function listenOnNode(options: ListenOptions): Promise<Listening> {
  const lanAddress = checkedLanAddress(options);

  let server: Server | undefined;
  const http = createHttpServer((incoming, outgoing) => {
    if (server === undefined) {
      outgoing.writeHead(503).end();
      return;
    }
    answerRequest(server, incoming, outgoing).catch((error: unknown) => {
      options.logError(error);
      if (!outgoing.headersSent) {
        outgoing.writeHead(500);
      }
      outgoing.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(options.port, options.network ? "0.0.0.0" : "127.0.0.1", () => {
      http.off("error", reject);
      resolve();
    });
  });
  const close = () =>
    new Promise<void>((resolve, reject) => {
      http.close((error) => (error === undefined ? resolve() : reject(error)));
      http.closeAllConnections();
    });
  try {
    const address = http.address();
    if (address === null || typeof address === "string") {
      throw new Error("The HTTP listener has no port.");
    }
    const allowedHosts =
      options.publicOrigin === undefined
        ? [`localhost:${address.port}`]
        : [new URL(options.publicOrigin).host];
    if (lanAddress !== undefined) {
      allowedHosts.push(`${lanAddress}:${address.port}`);
    }
    server = options.createServer(allowedHosts);
    if (lanAddress !== undefined) {
      options.report(`Open on your phone: http://${lanAddress}:${address.port}`);
    }
    return { host: address.address, port: address.port, close };
  } catch (error) {
    // Don't leave the port bound, on every address in network mode, with no one to close it.
    await close();
    throw error;
  }
}
