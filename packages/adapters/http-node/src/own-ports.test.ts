import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { AddressRefusedError } from "./address-refused.ts";
import { type LoopbackServer, startLoopbackServer } from "./loopback-server.test-helper.ts";
import { createNodeHttpClient } from "./node-http-client.ts";

let server: LoopbackServer;

beforeEach(async () => {
  server = await startLoopbackServer((_request, response) => response.end("hello"));
});

afterEach(async () => {
  await server.close();
});

verifies("http-node.own-ports", () => {
  it("refuses one of Halonic's own ports on this computer, before any connection (A10)", async () => {
    const http = createNodeHttpClient({
      hostClass: () => "loopback",
      ownPorts: () => [server.port],
    });
    const request = http.fetch(`http://127.0.0.1:${server.port}/`);
    await expect(request).rejects.toBeInstanceOf(AddressRefusedError);
    await expect(request).rejects.toThrow(`127.0.0.1:${server.port} is one of Halonic's own ports`);
    expect(server.connections()).toBe(0);
  });

  it("reads the own ports again on every request", async () => {
    const ownPorts: number[] = [];
    const http = createNodeHttpClient({ hostClass: () => "loopback", ownPorts: () => ownPorts });
    expect(await (await http.fetch(`http://127.0.0.1:${server.port}/`)).text()).toBe("hello");
    ownPorts.push(server.port);
    await expect(http.fetch(`http://127.0.0.1:${server.port}/`)).rejects.toBeInstanceOf(
      AddressRefusedError,
    );
    expect(server.connections()).toBe(1);
  });
});
