// The connection trap lives in @halonicjs/testing-contracts/node, whose code
// is measured in this package's run (its "measuredIn"), so its tests run here.
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import tls from "node:tls";
import { refuseRealConnections, trapConnections } from "@halonicjs/testing-contracts/node";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";

/** Resolves with the error `socket` is destroyed with, or rejects if it connects. */
function refused(socket: net.Socket): Promise<Error> {
  return new Promise((resolve, reject) => {
    socket.once("error", resolve);
    socket.once("connect", () => reject(new Error("the socket connected")));
  });
}

/** Connects with the port written as text, which Node accepts but its types don't. */
function connectWithTextPort(port: string, host: string): net.Socket {
  const socket = new net.Socket();
  const connect = socket.connect as (...args: unknown[]) => net.Socket;
  return connect.call(socket, port, host);
}

/** A TCP server on this machine that answers every connection with "local" and closes it. */
async function localServer(listen: (server: net.Server) => void): Promise<net.Server> {
  const server = net.createServer((socket) => socket.end("local"));
  listen(server);
  await once(server, "listening");
  return server;
}

/** Everything `socket` sends until it closes. */
async function readAll(socket: net.Socket): Promise<string> {
  let text = "";
  for await (const chunk of socket) text += String(chunk);
  return text;
}

const original = net.Socket.prototype.connect;

verifies("contracts.connector-client", () => {
  describe("trapConnections", () => {
    it("refuses and records a TCP connection to another machine, however it is opened", async () => {
      const trap = trapConnections();
      try {
        const errors = [
          refused(net.connect(443, "203.0.113.7")),
          refused(net.connect({ host: "api.example.test", port: 8443 })),
          refused(new net.Socket().connect({ host: "198.51.100.2", port: 25 })),
          refused(connectWithTextPort("8080", "198.51.100.3")),
          refused(tls.connect({ host: "gmail.example.test", port: 993 })),
          new Promise<Error>((resolve) =>
            https.get("https://oauth2.example.test/token").once("error", resolve),
          ),
          fetch("http://drive.example.test:8080/files").then(
            () => new Error("fetch answered"),
            (error: Error) => error,
          ),
          refused(net.connect({ port: 4100, host: "127.0.0.1.example.test" })),
        ];
        for (const error of await Promise.all(errors)) {
          expect(String(error.cause ?? error)).toContain("reaches no network");
        }
        expect(trap.reached()).toEqual([
          "203.0.113.7:443",
          "api.example.test:8443",
          "198.51.100.2:25",
          "198.51.100.3:8080",
          "gmail.example.test:993",
          "oauth2.example.test:443",
          "drive.example.test:8080",
          "127.0.0.1.example.test:4100",
        ]);
      } finally {
        trap.restore();
      }
      expect(net.Socket.prototype.connect).toBe(original);
    });

    it("lets a connection to this machine or a local socket path through, unrecorded", async () => {
      const tcp = await localServer((server) => server.listen(0, "127.0.0.1"));
      const folder = await mkdtemp(join(tmpdir(), "halonic-trap-"));
      const path = join(folder, "server.sock");
      const pipe = await localServer((server) => server.listen(path));
      const { port } = tcp.address() as net.AddressInfo;
      const trap = trapConnections();
      try {
        const answers = await Promise.all([
          readAll(net.connect(port, "127.0.0.1")),
          readAll(net.connect({ port })),
          readAll(net.connect({ port, host: "localhost", family: 4 })),
          readAll(new net.Socket().connect(port)),
          readAll(net.connect(path)),
          readAll(net.connect({ path })),
        ]);
        expect(answers).toEqual(Array(6).fill("local"));
        expect(trap.reached()).toEqual([]);
      } finally {
        trap.restore();
        tcp.close();
        pipe.close();
        await rm(folder, { recursive: true, force: true });
      }
    });

    it("answers an http request to a test server on [::1]", async () => {
      const server = http.createServer((_request, response) => response.end("local"));
      server.listen(0, "::1");
      const listening = await Promise.race([
        once(server, "listening").then(() => true),
        once(server, "error").then(() => false),
      ]);
      // Some CI machines have no IPv6 loopback; the 127.0.0.1 cases cover them.
      if (!listening) return;
      const { port } = server.address() as net.AddressInfo;
      const trap = trapConnections();
      try {
        const response = await fetch(`http://[::1]:${port}/`);
        expect(await response.text()).toBe("local");
        expect(trap.reached()).toEqual([]);
      } finally {
        trap.restore();
        server.close();
      }
    });
  });

  describe("refuseRealConnections", () => {
    // Registered first, so it runs after the trap's own afterEach.
    afterEach(() => {
      expect(net.Socket.prototype.connect).toBe(original);
    });
    refuseRealConnections();

    it("switches the trap on for each case", () => {
      expect(net.Socket.prototype.connect).not.toBe(original);
    });

    it.fails("fails a case that opened a connection to another machine, also when it caught the error", async () => {
      const error = await refused(net.connect(443, "203.0.113.7"));
      expect(error.message).toContain("reaches no network");
    });
  });
});
