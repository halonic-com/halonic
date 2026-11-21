import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { bridgeProviderFetches } from "./provider-fetches.ts";

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
    response.end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: (server.address() as AddressInfo).port,
    reached: () => reached,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

let server: CountingServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

verifies("agent-host.compatible-provider-client", () => {
  describe("bridgeProviderFetches' compatibleFetch", () => {
    it("refuses a baseUrl on one of the host's own ports, and sends it nothing", async () => {
      server = await countingServer();
      const ownPort = server.port;
      const { compatibleFetch } = bridgeProviderFetches(() => [ownPort], undefined);
      await expect(compatibleFetch(`http://127.0.0.1:${ownPort}/v1/messages`)).rejects.toThrow(
        "one of Halonic's own ports",
      );
      expect(server.reached()).toBe(0);
    });

    it("reads the host's ports on each call, so a bridge opened later is refused too", async () => {
      server = await countingServer();
      const ownPorts: number[] = [];
      const { compatibleFetch } = bridgeProviderFetches(() => ownPorts, undefined);
      ownPorts.push(server.port);
      await expect(compatibleFetch(`http://127.0.0.1:${server.port}/v1/messages`)).rejects.toThrow(
        "one of Halonic's own ports",
      );
      expect(server.reached()).toBe(0);
    });

    it("reaches a baseUrl on this computer that isn't one of Halonic's ports", async () => {
      server = await countingServer();
      const { compatibleFetch } = bridgeProviderFetches(() => [], undefined);
      const response = await compatibleFetch(`http://127.0.0.1:${server.port}/v1/messages`);
      expect(response.status).toBe(200);
      expect(server.reached()).toBe(1);
    });
  });
});
