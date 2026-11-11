import { chmod, lstat, mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { HarnessBridgeOptions, OpenHarnessBridge } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type BridgeSettings, openBridge } from "./bridge.ts";
import { fakeRun } from "./fakes.test-helper.ts";
import {
  openTunnel,
  type RawRequest,
  requestText,
  sendAndHangUp,
  sendOver,
  sendPipelined,
  sendToSocket,
  statuses,
} from "./raw-client.test-helper.ts";
import type { BridgeRoute } from "./route.ts";
import { makeRunSocketFolder, maxSocketPathBytes } from "./socket-folder.ts";

const name = "bridge.halonic.invalid";

/** Paths the route was called for, so a test can tell a request never reached it. */
const served: string[] = [];

/** A route that answers with the body it was sent. */
const echo: BridgeRoute = {
  method: "POST",
  path: "/echo",
  handle: async ({ readBody, request, response }) => {
    served.push(request.url ?? "");
    response.end(await readBody());
  },
};

let parent = "";
const opened: OpenHarnessBridge[] = [];

beforeEach(async () => {
  served.length = 0;
  parent = await mkdtemp(join(tmpdir(), "bridge-"));
});

afterEach(async () => {
  await Promise.all(opened.splice(0).map((bridge) => bridge.close()));
  await rm(parent, { recursive: true, force: true });
});

function settingsIn(folder: string): BridgeSettings {
  return {
    place: { kind: "socket", folder },
    limits: { maxBytes: 1024, timeoutMs: 5_000 },
    routes: [echo],
    closeTimeoutMs: 1_000,
  };
}

async function open(run: HarnessBridgeOptions = fakeRun()) {
  const bridge = await openBridge(run, settingsIn(join(parent, "bridges")));
  opened.push(bridge);
  return { bridge, socketPath: bridge.socketPath ?? "" };
}

/** A request to the echo route addressed to the bridge's name, with `bridge`'s token. */
function toEcho(bridge: OpenHarnessBridge, overrides: Partial<RawRequest> = {}): RawRequest {
  return { target: "/echo", host: name, token: bridge.token, body: "hi", ...overrides };
}

verifies("harness-bridge.socket", () => {
  describe("where it listens", () => {
    it("listens on a socket in a new private folder, under the bridge's name", async () => {
      const { bridge, socketPath } = await open();

      expect(bridge.url).toBe(`http://${name}`);
      expect(dirname(dirname(socketPath))).toBe(join(parent, "bridges"));
      expect((await lstat(socketPath)).isSocket()).toBe(true);
      const folder = await lstat(dirname(socketPath));
      expect(folder.isDirectory()).toBe(true);
      expect(folder.mode & 0o777).toBe(0o700);
      expect(folder.uid).toBe(process.getuid?.());
    });

    it("removes the socket and its folder when it closes, or the run's signal aborts", async () => {
      const { bridge, socketPath } = await open();
      await bridge.close();
      const stopping = new AbortController();
      const second = await open(fakeRun(stopping.signal));
      stopping.abort();
      await second.bridge.close();

      expect(await readdir(join(parent, "bridges"))).toEqual([]);
      await expect(lstat(socketPath)).rejects.toThrow();
    });

    it("refuses a socket path over Linux's limit up front, and creates nothing", async () => {
      const deep = join(parent, "d".repeat(maxSocketPathBytes));

      await expect(openBridge(fakeRun(), settingsIn(deep))).rejects.toThrow(
        /socket path would be \d+ bytes, and Linux takes at most 107/,
      );
      expect(await readdir(parent)).toEqual([]);
    });

    it("refuses a run folder that already exists, as a folder or a link, and leaves it", async () => {
      const taken = join(parent, "taken");
      await mkdir(taken);
      await symlink(taken, join(parent, "link"));

      await expect(makeRunSocketFolder(parent, "taken")).rejects.toThrow(
        "couldn't create the bridge's socket folder",
      );
      await expect(makeRunSocketFolder(parent, "link")).rejects.toThrow(
        "couldn't create the bridge's socket folder",
      );
      expect((await lstat(taken)).isDirectory()).toBe(true);
      expect((await lstat(join(parent, "link"))).isSymbolicLink()).toBe(true);
    });

    it("refuses a parent folder others can write to, or a link, and creates nothing in it", async () => {
      const shared = join(parent, "shared");
      await mkdir(shared);
      await chmod(shared, 0o777);
      const elsewhere = join(parent, "elsewhere");
      await mkdir(elsewhere, { mode: 0o700 });
      await symlink(elsewhere, join(parent, "linked"));

      for (const folder of [shared, join(parent, "linked")]) {
        await expect(makeRunSocketFolder(folder, "run")).rejects.toThrow(
          "isn't private to this user",
        );
      }
      expect(await readdir(shared)).toEqual([]);
      expect(await readdir(elsewhere)).toEqual([]);
    });
  });

  describe("who it serves", () => {
    it("serves its name, with or without port 80, and the absolute form", async () => {
      const { bridge, socketPath } = await open();
      const replies = [
        await sendToSocket(socketPath, toEcho(bridge)),
        await sendToSocket(socketPath, toEcho(bridge, { host: `${name}:80` })),
        await sendToSocket(socketPath, toEcho(bridge, { host: name.toUpperCase() })),
        await sendToSocket(socketPath, toEcho(bridge, { target: `http://${name}/echo` })),
        await sendToSocket(socketPath, toEcho(bridge, { target: `http://${name}:80/echo` })),
      ];

      expect(replies.map(({ status }) => status)).toEqual([200, 200, 200, 200, 200]);
      expect(served).toHaveLength(5);
    });

    it("answers 421 to any other host, in the Host header or the absolute target", async () => {
      const { bridge, socketPath } = await open();
      const wrong: Partial<RawRequest>[] = [
        { host: `${name}.` },
        { host: `${name}:8080` },
        { host: "other.example" },
        { target: "http://other.example/echo" },
        { target: `https://${name}/echo` },
        { target: "//other.example/echo" },
        { target: `http://${name}/echo`, host: "other.example" },
      ];
      for (const overrides of wrong) {
        const reply = await sendToSocket(socketPath, toEcho(bridge, overrides));
        expect(reply.status, JSON.stringify(overrides)).toBe(421);
        expect(reply.text).not.toContain(bridge.token);
      }
      expect(served).toEqual([]);
    });

    it("keeps the Origin and token checks", async () => {
      const { bridge, socketPath } = await open();
      const fromPage = toEcho(bridge, { headers: { origin: "https://evil.example" } });

      expect((await sendToSocket(socketPath, fromPage)).status).toBe(403);
      expect((await sendToSocket(socketPath, toEcho(bridge, { token: undefined }))).status).toBe(
        401,
      );
      expect(served).toEqual([]);
    });

    it("serves nothing more on a connection once a request on it was refused", async () => {
      const { bridge, socketPath } = await open();
      const text = requestText(toEcho(bridge, { token: undefined })) + requestText(toEcho(bridge));

      const answered = await sendPipelined(socketPath, text);

      expect(statuses(answered)).toEqual([401]);
      expect(served).toEqual([]);
    });
  });

  describe("tunnels", () => {
    it("opens a tunnel to its own name on port 80 and checks every request inside", async () => {
      const { bridge, socketPath } = await open();
      const served1 = await openTunnel(socketPath, `${name}:80`);
      const noToken = await openTunnel(socketPath, `${name}:80`);
      const fromPage = await openTunnel(socketPath, `${name}:80`);

      expect([served1.status, noToken.status, fromPage.status]).toEqual([200, 200, 200]);
      expect((await sendOver(served1.connection, toEcho(bridge))).status).toBe(200);
      expect(
        (await sendOver(noToken.connection, toEcho(bridge, { token: undefined }))).status,
      ).toBe(401);
      const withOrigin = toEcho(bridge, { headers: { origin: "https://evil.example" } });
      expect((await sendOver(fromPage.connection, withOrigin)).status).toBe(403);
      expect(served).toHaveLength(1);
    });

    it("answers 421 to a CONNECT to anything else, and closes the connection", async () => {
      const { socketPath } = await open();

      for (const target of ["other.example:443", `${name}:443`, `${name}.:80`, `${name}`]) {
        const answer = await openTunnel(socketPath, target);
        expect(answer.status, target).toBe(421);
        expect(answer.connection.readableEnded, target).toBe(true);
      }
    });

    it("stays up when a program sends a refused CONNECT and hangs up at once", async () => {
      const { bridge, socketPath } = await open();
      const uncaught: unknown[] = [];
      const record = (error: unknown) => uncaught.push(error);
      process.on("uncaughtException", record);
      try {
        for (let attempt = 0; attempt < 200; attempt += 1) {
          await sendAndHangUp(
            socketPath,
            "CONNECT other.example:443 HTTP/1.1\r\nhost: other.example:443\r\n\r\n",
          );
        }
        // Give a late write error on the last connections a turn to surface.
        await new Promise((resolve) => setImmediate(resolve));
      } finally {
        process.off("uncaughtException", record);
      }

      expect(uncaught).toEqual([]);
      expect((await sendToSocket(socketPath, toEcho(bridge))).status).toBe(200);
    });

    it("answers 421 to a CONNECT elsewhere sent inside a tunnel", async () => {
      const { socketPath } = await open();
      const tunnel = await openTunnel(socketPath, `${name}:80`);

      const inner = await new Promise<string>((resolve) => {
        const received: Buffer[] = [];
        tunnel.connection.on("data", (chunk: Buffer) => received.push(chunk));
        tunnel.connection.on("end", () => resolve(Buffer.concat(received).toString()));
        tunnel.connection.write(
          "CONNECT other.example:443 HTTP/1.1\r\nhost: other.example:443\r\n\r\n",
        );
      });

      expect(statuses(inner)).toEqual([421]);
    });
  });
});
