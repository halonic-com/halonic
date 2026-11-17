import { verifies } from "@halonicjs/testing-spec";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { AddressRefusedError } from "./address-refused.ts";
import { fakeResolver, startLoopbackServer } from "./loopback-server.test-helper.ts";
import { createNodeHttpClient, type NodeHttpOptions } from "./node-http-client.ts";
import { ProxyError } from "./proxy-error.ts";
import {
  type ProxyFixture,
  startProxy,
  startTlsOrigin,
  type TlsOrigin,
  trustCertificates,
  tunnelTo,
} from "./proxy-fixture.test-helper.ts";
import { proxyFromEnv } from "./proxy-from-env.ts";
import { selfSignedCertificate } from "./test-certificate.test-helper.ts";

const certificate = selfSignedCertificate({ names: ["model.test", "other.test"] });
let restoreTrust: () => void;
const stops: (() => Promise<void>)[] = [];

beforeAll(() => {
  restoreTrust = trustCertificates(certificate);
});

afterAll(() => restoreTrust());

afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
});

async function origin(answer?: Parameters<typeof startTlsOrigin>[1]): Promise<TlsOrigin> {
  const started = await startTlsOrigin(certificate, answer);
  stops.push(started.close);
  return started;
}

async function proxyFor(routes: Record<string, number>): Promise<ProxyFixture> {
  const started = await startProxy(tunnelTo(routes));
  stops.push(started.close);
  return started;
}

const proxyEnv = (port: number, noProxy?: string) =>
  proxyFromEnv({
    HTTPS_PROXY: `http://127.0.0.1:${port}`,
    ...(noProxy === undefined ? {} : { NO_PROXY: noProxy }),
  });

function client(options: Partial<NodeHttpOptions> & Pick<NodeHttpOptions, "proxy">) {
  return createNodeHttpClient({ hostClass: () => "public", ...options });
}

verifies("http-node.proxy-guard", () => {
  describe("which requests go through the proxy", () => {
    it("sends a loopback host direct, never to the proxy (attack 9)", async () => {
      const server = await startLoopbackServer((_request, response) => response.end("direct"));
      stops.push(server.close);
      const via = await proxyFor({});
      const http = client({ hostClass: () => "loopback", proxy: proxyEnv(via.port) });

      const response = await http.fetch(`http://127.0.0.1:${server.port}/`);

      expect(await response.text()).toBe("direct");
      expect(via.connects).toHaveLength(0);
    });

    it("sends a private host direct, with the full address check", async () => {
      const via = await proxyFor({});
      const resolver = fakeResolver({ "home.test": [["203.0.113.9"]] });
      const http = client({
        hostClass: () => "private",
        resolve: resolver.resolve,
        proxy: proxyEnv(via.port),
      });

      await expect(http.fetch("https://home.test/")).rejects.toBeInstanceOf(AddressRefusedError);
      expect(resolver.lookups).toEqual(["home.test"]);
      expect(via.connects).toHaveLength(0);
    });

    it("sends a NO_PROXY host direct, with the full address check", async () => {
      const via = await proxyFor({});
      const resolver = fakeResolver({ "model.test": [["10.0.0.5"]] });
      const http = client({ resolve: resolver.resolve, proxy: proxyEnv(via.port, "model.test") });

      await expect(http.fetch("https://model.test/")).rejects.toBeInstanceOf(AddressRefusedError);
      expect(via.connects).toHaveLength(0);
    });

    it("sends everything direct when no proxy is set", async () => {
      const resolver = fakeResolver({ "model.test": [["10.0.0.5"]] });
      const http = client({ resolve: resolver.resolve, proxy: proxyFromEnv({}) });

      await expect(http.fetch("https://model.test/")).rejects.toBeInstanceOf(AddressRefusedError);
    });

    it("refuses a host with no class before anything else", async () => {
      const via = await proxyFor({});
      const http = client({ hostClass: () => undefined, proxy: proxyEnv(via.port) });

      await expect(http.fetch("https://model.test/")).rejects.toBeInstanceOf(AddressRefusedError);
      expect(via.connects).toHaveLength(0);
    });

    it("refuses a public IP literal that isn't public, as it does without a proxy", async () => {
      const via = await proxyFor({});
      const http = client({ proxy: proxyEnv(via.port) });

      await expect(http.fetch("https://10.1.2.3/")).rejects.toBeInstanceOf(AddressRefusedError);
      expect(via.connects).toHaveLength(0);
    });
  });

  describe("a public http:// host (attack 3)", () => {
    it("is refused with advice, and neither tunnelled nor sent direct", async () => {
      const via = await proxyFor({});
      const resolver = fakeResolver({ "model.test": [["8.8.8.8"]] });
      const http = client({ resolve: resolver.resolve, proxy: proxyEnv(via.port) });

      const request = http.fetch("http://model.test/");

      await expect(request).rejects.toBeInstanceOf(ProxyError);
      await expect(request).rejects.toThrow(/Use https:\/\/, or add the host to NO_PROXY/);
      expect(via.connects).toHaveLength(0);
      expect(resolver.lookups).toEqual([]);
    });

    it("goes direct when NO_PROXY names it", async () => {
      const via = await proxyFor({});
      const resolver = fakeResolver({ "model.test": [["10.0.0.5"]] });
      const http = client({
        resolve: resolver.resolve,
        proxy: proxyEnv(via.port, "model.test"),
      });

      await expect(http.fetch("http://model.test/")).rejects.toBeInstanceOf(AddressRefusedError);
    });
  });

  describe("an unusable proxy setting (C2)", () => {
    const refused = proxyFromEnv({ HTTPS_PROXY: "socks5://proxy.corp:1080" });

    it("fails the requests that would use the proxy, with the plain message", async () => {
      const resolver = fakeResolver({ "model.test": [["8.8.8.8"]] });
      const http = client({ resolve: resolver.resolve, proxy: refused });

      const request = http.fetch("https://model.test/");

      await expect(request).rejects.toBeInstanceOf(ProxyError);
      await expect(request).rejects.toThrow(/Halonic supports an http:\/\/ proxy; yours is socks5/);
      expect(resolver.lookups).toEqual([]);
    });

    it("still reaches this computer", async () => {
      const server = await startLoopbackServer((_request, response) => response.end("direct"));
      stops.push(server.close);
      const http = client({ hostClass: () => "loopback", proxy: refused });

      expect(await (await http.fetch(`http://127.0.0.1:${server.port}/`)).text()).toBe("direct");
    });
  });

  describe("redirects through a proxy (attack 5)", () => {
    it("makes a new CONNECT for another origin and drops the caller's credentials", async () => {
      const second = await origin();
      const first = await origin((_request, response) => {
        response.writeHead(302, { location: `https://other.test:${second.port}/next` }).end();
      });
      const via = await proxyFor({
        [`model.test:${first.port}`]: first.port,
        [`other.test:${second.port}`]: second.port,
      });
      const http = client({ proxy: proxyEnv(via.port) });

      const response = await http.fetch(`https://model.test:${first.port}/`, {
        headers: {
          authorization: "Bearer provider-key",
          cookie: "session=abc",
          "proxy-authorization": "Basic Zm9vOmJhcg==",
        },
      });

      expect(await response.text()).toBe("hello");
      expect(via.connects.map((entry) => entry.target)).toEqual([
        `model.test:${first.port}`,
        `other.test:${second.port}`,
      ]);
      expect(first.requests[0]?.headers.authorization).toBe("Bearer provider-key");
      expect(second.requests[0]?.headers.authorization).toBeUndefined();
      expect(second.requests[0]?.headers.cookie).toBeUndefined();
      expect(second.requests[0]?.headers["proxy-authorization"]).toBeUndefined();
    });

    it("refuses a redirect to a plain http:// URL", async () => {
      const first = await origin((_request, response) => {
        response.writeHead(302, { location: "http://other.test/next" }).end();
      });
      const via = await proxyFor({ [`model.test:${first.port}`]: first.port });
      const http = client({ proxy: proxyEnv(via.port) });

      await expect(http.fetch(`https://model.test:${first.port}/`)).rejects.toBeInstanceOf(
        ProxyError,
      );
      expect(via.connects).toHaveLength(1);
    });

    it("sends a redirect to a NO_PROXY host direct, with the address check", async () => {
      const first = await origin((_request, response) => {
        response.writeHead(302, { location: "https://other.test/next" }).end();
      });
      const via = await proxyFor({ [`model.test:${first.port}`]: first.port });
      const resolver = fakeResolver({ "other.test": [["10.0.0.5"]] });
      const http = client({
        resolve: resolver.resolve,
        proxy: proxyEnv(via.port, "other.test"),
      });

      await expect(http.fetch(`https://model.test:${first.port}/`)).rejects.toBeInstanceOf(
        AddressRefusedError,
      );
      expect(via.connects).toHaveLength(1);
      expect(resolver.lookups).toEqual(["other.test"]);
    });

    it("sends a redirect to a private host direct, never to the proxy", async () => {
      const first = await origin((_request, response) => {
        response.writeHead(302, { location: "https://home.test/next" }).end();
      });
      const via = await proxyFor({ [`model.test:${first.port}`]: first.port });
      const resolver = fakeResolver({ "home.test": [["8.8.8.8"]] });
      const http = client({
        hostClass: (url) => (url.hostname === "home.test" ? "private" : "public"),
        resolve: resolver.resolve,
        proxy: proxyEnv(via.port),
      });

      await expect(http.fetch(`https://model.test:${first.port}/`)).rejects.toBeInstanceOf(
        AddressRefusedError,
      );
      expect(via.connects).toHaveLength(1);
    });

    it("still stops a redirect loop", async () => {
      const server = await origin((_request, response) => {
        response.writeHead(302, { location: "/again" }).end();
      });
      const via = await proxyFor({ [`model.test:${server.port}`]: server.port });
      const http = client({ maxRedirects: 3, proxy: proxyEnv(via.port) });

      await expect(http.fetch(`https://model.test:${server.port}/`)).rejects.toThrow(
        /redirected more than 3 times/,
      );
      expect(via.connects).toHaveLength(4);
    });
  });

  describe("the proxy itself (attack 8)", () => {
    it("is refused on one of Halonic's own ports, before any connection", async () => {
      const via = await proxyFor({});
      const http = client({ ownPorts: () => [via.port], proxy: proxyEnv(via.port) });

      const request = http.fetch("https://model.test/");

      await expect(request).rejects.toBeInstanceOf(AddressRefusedError);
      await expect(request).rejects.toThrow(`127.0.0.1:${via.port} is one of Halonic's own ports`);
      expect(via.connects).toHaveLength(0);
    });

    it("may be a name, found with the normal lookup, and on a private address", async () => {
      const server = await origin();
      const via = await proxyFor({ [`model.test:${server.port}`]: server.port });
      const resolver = fakeResolver({ "proxy.test": [["127.0.0.1"]] });
      const http = client({
        resolve: resolver.resolve,
        proxy: proxyFromEnv({ HTTPS_PROXY: `http://proxy.test:${via.port}` }),
      });

      expect(await (await http.fetch(`https://model.test:${server.port}/`)).text()).toBe("hello");
      expect(resolver.lookups).toEqual(["proxy.test"]);
    });

    it("fails with a plain message when its name can't be found", async () => {
      const http = client({
        resolve: fakeResolver({}).resolve,
        proxy: proxyFromEnv({ HTTPS_PROXY: "http://proxy.test:3128" }),
      });

      await expect(http.fetch("https://model.test/")).rejects.toThrow(
        /Could not find your proxy http:\/\/proxy.test:3128/,
      );
    });

    it("is refused when its name answers with something that isn't an address", async () => {
      const http = client({
        resolve: async () => ["not-an-address"],
        proxy: proxyFromEnv({ HTTPS_PROXY: "http://proxy.test:3128" }),
      });

      await expect(http.fetch("https://model.test/")).rejects.toBeInstanceOf(AddressRefusedError);
    });
  });
});
