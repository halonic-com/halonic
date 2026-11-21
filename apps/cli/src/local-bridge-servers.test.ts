import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type HarnessBridgeOptions,
  type HarnessBridgeServer,
  type HttpClient,
  harnessBridgeTokenHeader,
  type OpenHarnessBridge,
} from "@halonicjs/ports";
import type { ProfileFolder } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { type LocalBridgeServersInput, localBridgeServers } from "./local-bridge-servers.ts";

// The bridges' calls to a provider's own `baseUrl` never reach one of
// Halonic's own ports (HAL-15251), through the CLI's real Node bridge: only
// the provider is a stand-in, a server on loopback that counts what reaches it.

/** An invented key the fake secrets hold for the provider. Not a real key. */
const key = "halonic-test-key-not-real-15251";

/** Windows serves every bridge on loopback, so no socket folder is made in this profile. */
const profile: ProfileFolder = { platform: "windows", root: join(tmpdir(), "acme-never-written") };

/** A server on loopback that stands in for a port, and counts what reaches it. */
interface CountingServer {
  readonly port: number;
  readonly reached: () => number;
  readonly close: () => Promise<void>;
}

async function countingServer(): Promise<CountingServer> {
  let reached = 0;
  const server: Server = createServer((_request, response) => {
    reached += 1;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ type: "message", content: [] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: (server.address() as AddressInfo).port,
    reached: () => reached,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

const closers: (() => Promise<void>)[] = [];

afterEach(async () => {
  for (const close of closers.splice(0).reverse()) await close();
});

/** Stands in for every part of the run these calls never use. */
async function notUsed(): Promise<never> {
  throw new Error("This test's run doesn't use this part.");
}

/** A run whose agent calls `glm-5.2` at the compatible provider `baseUrl`, with the key Halonic keeps. */
function runAt(baseUrl: string): HarnessBridgeOptions {
  return {
    runId: "run_1",
    agentId: "coder",
    providers: {
      anthropic: { kind: "key", secret: "zai-key", baseUrl, models: ["glm-5.2"] },
    },
    price: () => null,
    recorder: { record: async () => {} },
    tools: { list: notUsed, check: notUsed, call: notUsed },
    approvals: { request: notUsed },
  };
}

/** Opens a run's bridge on "On this computer"'s server, closed after the test. */
async function openBridge(
  input: Partial<LocalBridgeServersInput>,
  run: HarnessBridgeOptions,
): Promise<OpenHarnessBridge> {
  const servers = await localBridgeServers({
    secrets: { get: async (name) => (name === "zai-key" ? key : null) },
    platform: "win32",
    profile,
    ...input,
  });
  return await opened(servers["this-computer"], run);
}

async function opened(
  server: HarnessBridgeServer,
  run: HarnessBridgeOptions,
): Promise<OpenHarnessBridge> {
  const bridge = await server.open(run);
  closers.push(bridge.close);
  return bridge;
}

/** Calls the bridge's Messages route as Claude Code does, with the run token. */
async function callModel(bridge: OpenHarnessBridge): Promise<number> {
  const response = await fetch(new URL("/v1/messages", bridge.url), {
    method: "POST",
    headers: { [harnessBridgeTokenHeader]: bridge.token, "content-type": "application/json" },
    body: JSON.stringify({
      model: "glm-5.2",
      max_tokens: 64,
      messages: [{ role: "user", content: "Write the change." }],
    }),
  });
  await response.text();
  return response.status;
}

verifies("cli.bridge-compatible-own-ports", () => {
  describe("localBridgeServers", () => {
    it("refuses a baseUrl on serve's port, and sends it nothing", async () => {
      const serve = await countingServer();
      closers.push(serve.close);
      const bridge = await openBridge(
        { ownPorts: () => [serve.port] },
        runAt(`http://127.0.0.1:${serve.port}/anthropic`),
      );

      expect(await callModel(bridge)).toBeGreaterThanOrEqual(400);
      expect(serve.reached()).toBe(0);
    });

    it("reaches a baseUrl on this computer that isn't one of Halonic's ports", async () => {
      const provider = await countingServer();
      closers.push(provider.close);
      const bridge = await openBridge({}, runAt(`http://127.0.0.1:${provider.port}/anthropic`));

      expect(await callModel(bridge)).toBe(200);
      expect(provider.reached()).toBe(1);
    });

    it("counts each open bridge's port as Halonic's own until that bridge has closed", async () => {
      let ownPorts: () => Iterable<number> = () => [];
      const unused: HttpClient = { fetch: notUsed };
      const servers = await localBridgeServers({
        secrets: { get: async () => null },
        platform: "win32",
        profile,
        ownPorts: () => [4000],
        compatibleHttp: (given) => {
          ownPorts = given;
          return unused;
        },
      });
      const first = await opened(servers["this-computer"], runAt("http://127.0.0.1:1/anthropic"));
      const second = await opened(servers.sandbox, runAt("http://127.0.0.1:1/anthropic"));
      const portOf = (bridge: OpenHarnessBridge) => Number(new URL(bridge.url).port);

      const sorted = (ports: Iterable<number>) => [...ports].sort((a, b) => a - b);

      expect(sorted(ownPorts())).toEqual(sorted([portOf(first), portOf(second), 4000]));
      await first.close();
      expect(sorted(ownPorts())).toEqual(sorted([portOf(second), 4000]));
    });
  });
});
