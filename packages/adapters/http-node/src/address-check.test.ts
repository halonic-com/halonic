import type { HostClass } from "@halonicjs/adapter-http-kit";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { AddressRefusedError } from "./address-refused.ts";
import { fixedLookup } from "./checked-addresses.ts";
import {
  fakeResolver,
  type LoopbackServer,
  startLoopbackServer,
} from "./loopback-server.test-helper.ts";
import { createNodeHttpClient } from "./node-http-client.ts";

let server: LoopbackServer;

beforeEach(async () => {
  server = await startLoopbackServer((_request, response) => response.end("hello"));
});

afterEach(async () => {
  await server.close();
});

/** Every name ends in `.test`, so a request that works proves the fake resolver, not real DNS, answered. */
const classes: Readonly<Record<string, HostClass>> = {
  "api.example.test": "public",
  "nas.example.test": "private",
  "this.example.test": "loopback",
};

function client(answers: Readonly<Record<string, readonly (readonly string[])[]>>) {
  const resolver = fakeResolver(answers);
  const http = createNodeHttpClient({
    hostClass: (url) =>
      classes[url.hostname] ?? (url.hostname === "127.0.0.1" ? "loopback" : undefined),
    resolve: resolver.resolve,
  });
  return { http, lookups: resolver.lookups };
}

verifies("http-node.address-check", () => {
  it.each([
    "127.0.0.1",
    "10.0.0.5",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "fd00:ec2::254",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
    "64:ff9b::a9fe:a9fe",
    "fe80::1",
    "100.64.0.1",
    "0.0.0.0",
  ])("refuses a public host whose answer is %s, before any connection (A7)", async (address) => {
    const { http } = client({ "api.example.test": [[address]] });
    const request = http.fetch(`http://api.example.test:${server.port}/`);
    await expect(request).rejects.toBeInstanceOf(AddressRefusedError);
    await expect(request).rejects.toMatchObject({ code: "address-not-allowed" });
    expect(server.connections()).toBe(0);
  });

  it("connects only to the checked address of a mixed answer (A28)", async () => {
    const { http } = client({ "this.example.test": [["10.0.0.5", "127.0.0.1", "93.184.215.14"]] });
    const response = await http.fetch(`http://this.example.test:${server.port}/`);
    expect(await response.text()).toBe("hello");
    expect(server.connections()).toBe(1);
  });

  it("resolves once per request, so a second answer can't change the address (A8)", async () => {
    const { http, lookups } = client({ "this.example.test": [["127.0.0.1"], ["10.0.0.5"]] });
    const first = await http.fetch(`http://this.example.test:${server.port}/`);
    expect(await first.text()).toBe("hello");
    expect(lookups).toEqual(["this.example.test"]);
    await expect(http.fetch(`http://this.example.test:${server.port}/`)).rejects.toBeInstanceOf(
      AddressRefusedError,
    );
    expect(server.connections()).toBe(1);
  });

  it.each(["93.184.215.14", "169.254.10.1", "127.0.0.1"])(
    "refuses a home-network host whose answer is %s (A9)",
    async (address) => {
      const { http } = client({ "nas.example.test": [[address]] });
      await expect(http.fetch(`http://nas.example.test:${server.port}/`)).rejects.toBeInstanceOf(
        AddressRefusedError,
      );
      expect(server.connections()).toBe(0);
    },
  );

  it("checks an IP address in the URL as it is, with no lookup", async () => {
    const { http, lookups } = client({});
    const response = await http.fetch(`http://127.0.0.1:${server.port}/`);
    expect(await response.text()).toBe("hello");
    expect(lookups).toEqual([]);
  });

  it("refuses a host with no class before any lookup (A5)", async () => {
    const { http, lookups } = client({ "shop.example.test": [["127.0.0.1"]] });
    await expect(http.fetch(`http://shop.example.test:${server.port}/`)).rejects.toBeInstanceOf(
      AddressRefusedError,
    );
    expect(lookups).toEqual([]);
    expect(server.connections()).toBe(0);
  });

  it("refuses an answer that isn't plain address text, such as one with a zone ID", async () => {
    const { http } = client({ "this.example.test": [["fe80::1%eth0"]] });
    await expect(http.fetch(`http://this.example.test:${server.port}/`)).rejects.toBeInstanceOf(
      AddressRefusedError,
    );
  });

  it("uses Node's own lookup when no resolver is given", async () => {
    const http = createNodeHttpClient({ hostClass: () => "loopback" });
    const response = await http.fetch(`http://localhost:${server.port}/`);
    expect(await response.text()).toBe("hello");
  });

  it("hands out the checked addresses, all of them or the first", () => {
    const lookup = fixedLookup(["127.0.0.1", "::1"]);
    const all: unknown[] = [];
    lookup("this.example.test", { all: true }, (...args: unknown[]) => all.push(args));
    lookup("this.example.test", {}, (...args: unknown[]) => all.push(args));
    expect(all).toEqual([
      [
        null,
        [
          { address: "127.0.0.1", family: 4 },
          { address: "::1", family: 6 },
        ],
      ],
      [null, "127.0.0.1", 4],
    ]);
  });

  it("fails a lookup that has no checked address", () => {
    const errors: unknown[] = [];
    fixedLookup([])("this.example.test", {}, (error) => errors.push(error));
    expect(errors[0]).toBeInstanceOf(AddressRefusedError);
  });
});
