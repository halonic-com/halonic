import type { HostClass } from "@halonicjs/adapter-http-kit";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { AddressRefusedError } from "./address-refused.ts";
import {
  fakeResolver,
  type LoopbackServer,
  startLoopbackServer,
} from "./loopback-server.test-helper.ts";
import { createNodeHttpClient } from "./node-http-client.ts";

let server: LoopbackServer;

beforeEach(async () => {
  server = await startLoopbackServer((request, response) => {
    const target = new URL(request.url ?? "/", "http://placeholder").searchParams.get("to");
    if (target === null) {
      response.end(`landed on ${request.headers.host}`);
      return;
    }
    const status = Number(
      new URL(request.url ?? "/", "http://placeholder").searchParams.get("status") ?? 302,
    );
    const location =
      target === "self" ? (request.url ?? "/") : target.replace("PORT", String(server.port));
    response.writeHead(status, { location }).end();
  });
});

afterEach(async () => {
  await server.close();
});

const classes: Readonly<Record<string, HostClass>> = {
  "this.example.test": "loopback",
  "also-this.example.test": "loopback",
  "api.example.test": "public",
};

function client() {
  const resolver = fakeResolver({
    "this.example.test": [["127.0.0.1"]],
    "also-this.example.test": [["127.0.0.1"]],
    "api.example.test": [["127.0.0.1"]],
  });
  return createNodeHttpClient({
    hostClass: (url) => classes[url.hostname],
    resolve: resolver.resolve,
    maxRedirects: 3,
  });
}

const start = () => `http://this.example.test:${server.port}/`;
const redirectTo = (target: string, status = 302) =>
  `${start()}?status=${status}&to=${encodeURIComponent(target)}`;

verifies("http-node.redirect-hops", () => {
  it("checks the address again on a hop, and refuses a private answer for a public host (A29)", async () => {
    const http = client();
    const request = http.fetch(redirectTo("http://api.example.test:PORT/"));
    await expect(request).rejects.toBeInstanceOf(AddressRefusedError);
    expect(server.received).toHaveLength(1);
  });

  it("refuses a hop to a host with no class", async () => {
    const http = client();
    await expect(http.fetch(redirectTo("http://shop.example.test:PORT/"))).rejects.toBeInstanceOf(
      AddressRefusedError,
    );
  });

  it("follows an allowed hop and drops origin-bound headers when the origin changes", async () => {
    const http = client();
    const response = await http.fetch(redirectTo("http://also-this.example.test:PORT/"), {
      headers: { authorization: "Bearer example-token", "x-trace": "kept" },
    });
    expect(await response.text()).toBe(`landed on also-this.example.test:${server.port}`);
    expect(response.url).toBe(`http://also-this.example.test:${server.port}/`);
    const [first, second] = server.received;
    expect(first?.headers.authorization).toBe("Bearer example-token");
    expect(second?.headers.authorization).toBeUndefined();
    expect(second?.headers["x-trace"]).toBe("kept");
  });

  it("turns a POST into a GET on 303 and keeps it on 307", async () => {
    const http = client();
    await http.fetch(redirectTo(start(), 303), { method: "POST", body: "a=1" });
    await http.fetch(redirectTo(start(), 307), { method: "POST", body: "a=1" });
    expect(server.received.map((request) => [request.method, request.body])).toEqual([
      ["POST", "a=1"],
      ["GET", ""],
      ["POST", "a=1"],
      ["POST", "a=1"],
    ]);
  });

  it("keeps a HEAD a HEAD on 303", async () => {
    const http = client();
    const response = await http.fetch(redirectTo(start(), 303), { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(server.received.map((request) => request.method)).toEqual(["HEAD", "HEAD"]);
  });

  it("returns the redirect as it is with manual", async () => {
    const http = client();
    const response = await http.fetch(redirectTo("http://api.example.test:PORT/"), {
      redirect: "manual",
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`http://api.example.test:${server.port}/`);
    expect(server.received).toHaveLength(1);
  });

  it("throws on a redirect with error", async () => {
    const http = client();
    await expect(http.fetch(redirectTo(start()), { redirect: "error" })).rejects.toThrow(
      "doesn't allow redirects",
    );
  });

  it("stops after the most redirects it takes", async () => {
    const http = client();
    await expect(http.fetch(`${start()}?to=self`)).rejects.toThrow("redirected more than 3 times");
    expect(server.received).toHaveLength(4);
  });

  it("refuses a hop to another scheme", async () => {
    const http = client();
    await expect(http.fetch(redirectTo("ftp://this.example.test/"))).rejects.toThrow(
      "only http and https",
    );
  });
});
