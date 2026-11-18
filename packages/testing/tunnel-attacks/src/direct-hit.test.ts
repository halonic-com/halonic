import { request } from "node:http";
import { connect } from "node:net";
import { networkInterfaces } from "node:os";
import { NodeHarnessBridgeServer } from "@halonicjs/adapter-harness-bridge";
import {
  assertGatewayTunnelConfig,
  type HarnessBridgeOptions,
  harnessBridgeTokenHeader,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { openTunnelRig } from "./tunnel-rig.ts";

/** The bridge is opened for its tunnel checks only; no provider or tool call is expected. */
async function noOutsideCall(): Promise<never> {
  throw new Error("This test doesn't expect a call to the outside.");
}

/** An address of this computer that isn't loopback, such as its LAN address, if it has one. */
function outsideAddress(): string | undefined {
  const all = Object.values(networkInterfaces()).flatMap((list) => list ?? []);
  return all.find((address) => address.family === "IPv4" && !address.internal)?.address;
}

function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port, timeout: 1_000 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function unused(): Promise<never> {
  throw new Error("The attack tests never reach this part of a run.");
}

/** A run with nothing behind it: enough for the bridge to open and to check requests. */
const bareRun: HarnessBridgeOptions = {
  runId: "run_attack",
  agentId: "writer",
  providers: {},
  price: () => null,
  recorder: { record: unused },
  tools: { list: unused, check: unused, call: unused },
  approvals: { request: unused },
};

/** Sends one request with any `Host` and header set, and gives the status and the body. */
function send(
  port: number,
  path: string,
  options: { method?: string; host: string; headers?: Record<string, string> },
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const call = request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: options.method ?? "POST",
        headers: { host: options.host, ...options.headers },
      },
      (reply) => {
        const chunks: Buffer[] = [];
        reply.on("data", (chunk: Buffer) => chunks.push(chunk));
        reply.on("end", () =>
          resolve({ status: reply.statusCode ?? 0, body: Buffer.concat(chunks).toString() }),
        );
      },
    );
    call.on("error", reject);
    call.end("{}");
  });
}

verifies("tunnel-attacks.direct-hit", () => {
  describe("a client on this computer's other addresses", () => {
    it("can't connect to the gateway or the bridge, there or on ::1", async () => {
      const rig = await openTunnelRig();
      const bridge = await new NodeHarnessBridgeServer({
        secrets: { get: async () => null },
        fetch: noOutsideCall,
      }).open(bareRun);
      try {
        const bridgePort = Number(new URL(bridge.url).port);
        // The ports are really open, so a refusal below says something about the address.
        expect(await canConnect("127.0.0.1", rig.gateway.port)).toBe(true);
        expect(await canConnect("127.0.0.1", bridgePort)).toBe(true);
        expect(await canConnect("::1", rig.gateway.port)).toBe(false);
        expect(await canConnect("::1", bridgePort)).toBe(false);
        // A machine with no other address has nothing more to prove here; a CI runner has one.
        const outside = outsideAddress();
        if (outside !== undefined) {
          expect(await canConnect(outside, rig.gateway.port)).toBe(false);
          expect(await canConnect(outside, bridgePort)).toBe(false);
        }
      } finally {
        await bridge.close();
        await rig.stop();
      }
    });
  });

  describe("a tunnel that points somewhere else", () => {
    it("is refused by the host's check, and all but a wrong port by the fake provider too, so no tunnel is made", async () => {
      const rig = await openTunnelRig();
      const bridge = await new NodeHarnessBridgeServer({
        secrets: { get: async () => null },
        fetch: noOutsideCall,
      }).open(bareRun);
      try {
        const bridgePort = Number(new URL(bridge.url).port);
        const configs: unknown[] = [
          { gateway: { host: "127.0.0.1", port: bridgePort } },
          { gateway: { host: "0.0.0.0", port: rig.gateway.port } },
          { gateway: { host: "localhost", port: rig.gateway.port } },
          { gateway: { host: "::", port: rig.gateway.port } },
          { gateway: { host: outsideAddress() ?? "192.168.1.5", port: rig.gateway.port } },
          { gateway: { host: "127.0.0.1", port: rig.gateway.port }, bridge: { port: bridgePort } },
          { gateway: { host: "127.0.0.1", port: rig.gateway.port, path: "/v1/messages" } },
          { bridge: { host: "127.0.0.1", port: bridgePort } },
          { gateway: { host: "127.0.0.1", port: 0 } },
          { gateway: { host: "127.0.0.1", port: 65_536 } },
          { gateway: { host: "127.0.0.1", port: "4100" } },
          null,
        ];
        for (const config of configs) {
          expect(() => assertGatewayTunnelConfig(config, rig.gateway.port)).toThrow(RangeError);
        }
        const other = new (rig.tunnel.constructor as new () => typeof rig.tunnel)();
        // The provider checks the shape and the loopback host; which port is the gateway's is the host's check above.
        for (const config of configs.slice(1)) {
          await expect(other.start(config as never)).rejects.toThrow(RangeError);
        }
        expect((await other.capabilities()).id).toBe("fake");
      } finally {
        await bridge.close();
        await rig.stop();
      }
    });
  });

  describe("a client that reaches the gateway through the tunnel", () => {
    it("finds no route to the bridge, the model gateway, MCP or secrets", async () => {
      const rig = await openTunnelRig();
      try {
        const paths = [
          "/v1/messages",
          "/v1/responses",
          "/v1/chat/completions",
          "/mcp",
          "/v1/mcp",
          "/secrets",
          "/api/secrets",
          "/v1/secrets/token",
          "/",
          "/health",
        ];
        for (const path of paths) {
          for (const method of ["GET", "POST", "PUT", "DELETE"]) {
            for (const headers of [{}, { [harnessBridgeTokenHeader]: "guessed-token" }]) {
              const answer = await send(rig.forwarderPort, path, {
                method,
                host: rig.tunnelName,
                headers,
              });
              expect(answer, `${method} ${path}`).toEqual({ status: 404, body: "" });
            }
          }
        }
        expect(rig.source.calls).toEqual([]);
      } finally {
        await rig.stop();
      }
    });
  });

  describe("the bridge, if a client could reach it", () => {
    it("refuses the tunnel's name as a Host, token or no token", async () => {
      const rig = await openTunnelRig();
      const bridge = await new NodeHarnessBridgeServer({
        secrets: { get: async () => null },
        fetch: noOutsideCall,
      }).open(bareRun);
      try {
        const port = Number(new URL(bridge.url).port);
        for (const headers of [{}, { [harnessBridgeTokenHeader]: bridge.token }]) {
          const answer = await send(port, "/v1/messages", { host: rig.tunnelName, headers });
          expect(answer.status).toBe(421);
        }
      } finally {
        await bridge.close();
        await rig.stop();
      }
    });
  });
});
