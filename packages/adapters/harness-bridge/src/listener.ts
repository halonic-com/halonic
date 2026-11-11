import type { Server } from "node:http";
import { KindedError } from "@halonicjs/std";
import {
  makeRunSocketFolder,
  type RunSocketFolder,
  removeRunSocketFolder,
} from "./socket-folder.ts";

/** Only this computer can reach a loopback bridge: never another machine on the network. */
const loopbackHost = "127.0.0.1";

/**
 * The name a program calls a socket bridge by. `.invalid` never resolves
 * (RFC 2606), so a request for it reaches nothing unless the sandbox's proxy
 * sends it to the socket.
 */
export const socketBridgeName = "bridge.halonic.invalid";

/**
 * Where a bridge listens: a free loopback port, or a new Unix socket in a
 * folder of its own inside `folder`.
 */
export type BridgePlace = { kind: "loopback" } | { kind: "socket"; folder: string };

/** A bridge's server once it listens, with what its checks need to know. */
export interface BridgeListening {
  /** The address the program calls. */
  url: string;
  /** The socket's path, for a socket bridge. */
  socketPath?: string;
  /** The `Host` values, in lower case, that name this bridge. */
  hosts: ReadonlySet<string>;
  /**
   * The one `CONNECT` target the bridge opens a tunnel to, in lower case, or
   * `undefined` when it opens none. Only a socket bridge does, because the
   * sandbox's proxy may tunnel a program's request to it.
   */
  tunnelTarget?: string;
  /** Removes what listening left behind, once the server has closed. */
  cleanUp(): Promise<void>;
}

/**
 * Starts `server` listening at `place`. A socket bridge never falls back to
 * a port: when its socket can't be made, this throws.
 *
 * @throws KindedError when the bridge can't listen there
 */
export function listenAt(server: Server, place: BridgePlace): Promise<BridgeListening> {
  return place.kind === "loopback"
    ? listenOnLoopback(server)
    : listenOnSocket(server, place.folder);
}

async function listenOnLoopback(server: Server): Promise<BridgeListening> {
  await listen(server, (done) => server.listen(0, loopbackHost, done));
  const address = server.address();
  // A TCP server always has an address object once it listens; a string is a pipe's path.
  if (address === null || typeof address === "string") {
    throw new KindedError("internal", "The bridge listens without a port.");
  }
  const { port } = address;
  return {
    url: `http://${loopbackHost}:${port}`,
    hosts: new Set([`${loopbackHost}:${port}`, `localhost:${port}`]),
    cleanUp: async () => {},
  };
}

async function listenOnSocket(server: Server, parent: string): Promise<BridgeListening> {
  const run: RunSocketFolder = await makeRunSocketFolder(parent);
  try {
    await listen(server, (done) => server.listen(run.socketPath, done));
  } catch (error) {
    await removeRunSocketFolder(run);
    throw error;
  }
  return {
    url: `http://${socketBridgeName}`,
    socketPath: run.socketPath,
    // srt's proxy drops port 80 from `Host`; a program writing it is just as fine.
    hosts: new Set([socketBridgeName, `${socketBridgeName}:80`]),
    tunnelTarget: `${socketBridgeName}:80`,
    cleanUp: () => removeRunSocketFolder(run),
  };
}

/** Runs `start` and resolves once the server listens. */
function listen(server: Server, start: (done: () => void) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (cause: Error) => {
      reject(
        new KindedError("unavailable", "Halonic couldn't start the bridge on this computer.", {
          cause,
        }),
      );
    };
    server.once("error", onError);
    start(() => {
      // Listening worked, so this listener has nothing left to report.
      server.off("error", onError);
      resolve();
    });
  });
}
