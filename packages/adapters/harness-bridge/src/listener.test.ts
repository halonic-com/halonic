import { mkdir, mkdtemp, readdir, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listenAt } from "./listener.ts";

/** A server whose `listen` fails the way a taken port or an unusable socket path does. */
function serverThatCannotListen(): Server {
  const server = createServer();
  server.listen = ((..._arguments: unknown[]) => {
    queueMicrotask(() => server.emit("error", new Error("listen refused")));
    return server;
  }) as Server["listen"];
  return server;
}

/** A server that listens, but reports a pipe's path instead of a port. */
function serverWithoutPort(): Server {
  const server = createServer();
  server.listen = ((...listenArguments: unknown[]) => {
    const done = listenArguments.at(-1) as () => void;
    queueMicrotask(done);
    return server;
  }) as Server["listen"];
  server.address = () => "/a/pipe";
  return server;
}

let parent = "";
const servers: Server[] = [];

beforeEach(async () => {
  parent = await mkdtemp(join(tmpdir(), "listener-"));
});

afterEach(async () => {
  for (const server of servers.splice(0)) {
    if (server.listening) await new Promise((resolve) => server.close(resolve));
  }
  await rm(parent, { recursive: true, force: true });
});

verifies("harness-bridge.socket", () => {
  describe("listenAt", () => {
    it("fails with 'unavailable' when a socket can't be made, and leaves no run folder behind", async () => {
      const folder = join(parent, "bridges");
      await mkdir(folder);

      const failure = await listenAt(serverThatCannotListen(), { kind: "socket", folder }).catch(
        (error: unknown) => error,
      );

      expect(failure).toBeInstanceOf(KindedError);
      expect(failure).toMatchObject({ kind: "unavailable" });
      expect(await readdir(folder)).toEqual([]);
    });
  });
});

verifies("harness-bridge.server", () => {
  describe("listenAt on loopback", () => {
    it("names a free loopback port and both spellings of the host", async () => {
      const server = createServer();
      servers.push(server);

      const listening = await listenAt(server, { kind: "loopback" });
      const { port } = server.address() as AddressInfo;

      expect(listening.url).toBe(`http://127.0.0.1:${port}`);
      expect(listening.hosts).toEqual(new Set([`127.0.0.1:${port}`, `localhost:${port}`]));
      expect(listening.tunnelTarget).toBeUndefined();
    });

    it("fails with 'unavailable' when the port can't be taken", async () => {
      const failure = await listenAt(serverThatCannotListen(), { kind: "loopback" }).catch(
        (error: unknown) => error,
      );

      expect(failure).toMatchObject({ kind: "unavailable" });
    });

    it("fails with 'internal' when the server listens without a port", async () => {
      const failure = await listenAt(serverWithoutPort(), { kind: "loopback" }).catch(
        (error: unknown) => error,
      );

      expect(failure).toMatchObject({ kind: "internal" });
    });
  });
});
