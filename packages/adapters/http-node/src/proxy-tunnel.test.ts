import { verifies } from "@halonicjs/testing-spec";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { fixedLookup } from "./checked-addresses.ts";
import { openTunnel } from "./connect-tunnel.ts";
import { fakeResolver } from "./loopback-server.test-helper.ts";
import { createNodeHttpClient } from "./node-http-client.ts";
import { ProxyEndpoint } from "./proxy-endpoint.ts";
import { ProxyError } from "./proxy-error.ts";
import {
  type ConnectAnswer,
  type ProxyFixture,
  startProxy,
  startTlsOrigin,
  type TlsOrigin,
  trustCertificates,
  tunnelTo,
} from "./proxy-fixture.test-helper.ts";
import { proxyFromEnv } from "./proxy-from-env.ts";
import { selfSignedCertificate } from "./test-certificate.test-helper.ts";

const secret = "pa55-w0rd";
const modelCertificate = selfSignedCertificate({ names: ["model.test"] });
const strangerCertificate = selfSignedCertificate({ names: ["stranger.test"] });
const publicIp = "8.8.8.8";
const ipCertificate = selfSignedCertificate({ ipv4: [publicIp] });

let restoreTrust: () => void;
const stops: (() => Promise<void>)[] = [];

beforeAll(() => {
  restoreTrust = trustCertificates(modelCertificate, strangerCertificate, ipCertificate);
});

afterAll(() => restoreTrust());

afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
});

async function origin(certificate = modelCertificate): Promise<TlsOrigin> {
  const started = await startTlsOrigin(certificate);
  stops.push(started.close);
  return started;
}

async function proxy(answer: ConnectAnswer): Promise<ProxyFixture> {
  const started = await startProxy(answer);
  stops.push(started.close);
  return started;
}

/** A client whose proxy is on the loopback port, with the credentials in its URL. */
function clientVia(proxyPort: number, extra: { proxyConnectTimeoutMs?: number } = {}) {
  const resolver = fakeResolver({});
  const credentials = ["me", secret].join(":");
  const setting = proxyFromEnv({
    HTTPS_PROXY: `http://${credentials}${String.fromCharCode(64)}127.0.0.1:${proxyPort}`,
  });
  const http = createNodeHttpClient({
    hostClass: () => "public",
    resolve: resolver.resolve,
    proxy: setting,
    ...extra,
  });
  return { http, lookups: resolver.lookups };
}

const asked = (target: ProxyFixture["connects"][number]) => target.target;

verifies("http-node.proxy-tunnel", () => {
  describe("a request through the tunnel", () => {
    it("asks the proxy for the name and port, with the credentials, and sends ciphertext only", async () => {
      const server = await origin();
      const via = await proxy(tunnelTo({ [`model.test:${server.port}`]: server.port }));
      const { http, lookups } = clientVia(via.port);

      const response = await http.fetch(`https://model.test:${server.port}/v1?x=1`, {
        headers: {
          authorization: "Bearer provider-key",
          "proxy-authorization": "Basic Zm9vOmJhcg==",
        },
      });

      expect(await response.text()).toBe("hello");
      expect(via.connects.map(asked)).toEqual([`model.test:${server.port}`]);
      expect(via.connects[0]?.headers["proxy-authorization"]).toBe(
        `Basic ${Buffer.from(`me:${secret}`).toString("base64")}`,
      );
      expect(Buffer.concat(via.tunnelled).includes("provider-key")).toBe(false);
      expect(server.requests).toHaveLength(1);
      expect(server.requests[0]?.headers.authorization).toBe("Bearer provider-key");
      expect(server.requests[0]?.headers["proxy-authorization"]).toBeUndefined();
      expect(JSON.stringify(server.requests[0]?.headers)).not.toContain(secret);
      expect(lookups).toEqual([]);
    });

    it("asks for an IP literal as itself and checks the certificate's IP entry (C4)", async () => {
      const server = await origin(ipCertificate);
      const via = await proxy(tunnelTo({ [`${publicIp}:${server.port}`]: server.port }));
      const { http } = clientVia(via.port);

      const response = await http.fetch(`https://${publicIp}:${server.port}/`);

      expect(await response.text()).toBe("hello");
      expect(via.connects.map(asked)).toEqual([`${publicIp}:${server.port}`]);
    });

    it("refuses an IP literal whose certificate has no entry for that address", async () => {
      const server = await origin(modelCertificate);
      const via = await proxy(tunnelTo({ [`${publicIp}:${server.port}`]: server.port }));
      const { http } = clientVia(via.port);

      await expect(http.fetch(`https://${publicIp}:${server.port}/`)).rejects.toBeInstanceOf(
        ProxyError,
      );
      expect(server.requests).toHaveLength(0);
    });

    it("writes IPv6 in brackets on the CONNECT line", async () => {
      const via = await proxy(tunnelTo({}));
      const { http } = clientVia(via.port);

      await expect(http.fetch("https://[2606:4700:4700::1111]:8443/")).rejects.toThrow(
        /status 502/,
      );
      expect(via.connects.map(asked)).toEqual(["[2606:4700:4700::1111]:8443"]);
    });
  });

  describe("a proxy that lies about the target (attack 1)", () => {
    it("fails on the certificate before any request byte is sent", async () => {
      const server = await origin(strangerCertificate);
      const via = await proxy(tunnelTo({ [`model.test:${server.port}`]: server.port }));
      const { http } = clientVia(via.port);

      const request = http.fetch(`https://model.test:${server.port}/`, {
        headers: { authorization: "Bearer provider-key" },
      });

      await expect(request).rejects.toBeInstanceOf(ProxyError);
      await expect(request).rejects.toThrow(/security check/);
      expect(server.requests).toHaveLength(0);
    });
  });

  describe("a proxy that answers CONNECT with more or less than a clean 200 (attack 2)", () => {
    const refusals: [string, ConnectAnswer, RegExp][] = [
      [
        "407",
        (_r, c) => c.end("HTTP/1.1 407 Proxy Authentication Required\r\n\r\n"),
        /refused the user name and password/,
      ],
      ["502", (_r, c) => c.end("HTTP/1.1 502 Bad Gateway\r\n\r\n"), /status 502/],
      [
        "a redirect",
        (_r, c) => c.end("HTTP/1.1 302 Found\r\nlocation: https://elsewhere.test/\r\n\r\n"),
        /status 302/,
      ],
      [
        "a 200 followed by bytes before the handshake (C3)",
        (_r, c) => c.write("HTTP/1.1 200 OK\r\n\r\nINJECTED"),
        /before the connection .* was secure/,
      ],
      [
        "a header block that never ends (C3)",
        (_r, c) => c.write(`HTTP/1.1 200 OK\r\nx-padding: ${"a".repeat(20_000)}\r\n\r\n`),
        /Could not reach your proxy/,
      ],
    ];

    it.each(refusals)("fails on %s, and never goes direct", async (_name, answer, message) => {
      const via = await proxy(answer);
      const { http, lookups } = clientVia(via.port);

      const request = http.fetch("https://model.test/");

      await expect(request).rejects.toBeInstanceOf(ProxyError);
      await expect(request).rejects.toThrow(message);
      expect(lookups).toEqual([]);
      expect(via.connects).toHaveLength(1);
    });

    it("keeps the password out of every error", async () => {
      const via = await proxy((_r, c) =>
        c.end("HTTP/1.1 407 Proxy Authentication Required\r\n\r\n"),
      );
      const { http } = clientVia(via.port);

      const error = await http.fetch("https://model.test/").catch((caught: unknown) => caught);

      expect(String(error)).not.toContain(secret);
      expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain(secret);
    });
  });

  describe("a proxy that fails (attack 7)", () => {
    it("fails when the proxy is down", async () => {
      const via = await proxy(tunnelTo({}));
      const port = via.port;
      await via.close();
      const { http, lookups } = clientVia(port);

      await expect(http.fetch("https://model.test/")).rejects.toThrow(/Could not reach your proxy/);
      expect(lookups).toEqual([]);
    });

    it("fails when the proxy closes the tunnel before the handshake", async () => {
      const via = await proxy((_r, client) => {
        client.write("HTTP/1.1 200 OK\r\n\r\n", () => client.destroy());
      });
      const { http } = clientVia(via.port);

      await expect(http.fetch("https://model.test/")).rejects.toBeInstanceOf(ProxyError);
    });

    it("gives up on a proxy that never answers, after the connect timeout", async () => {
      const via = await proxy(() => {});
      const { http } = clientVia(via.port, { proxyConnectTimeoutMs: 50 });

      await expect(http.fetch("https://model.test/")).rejects.toThrow(/didn't answer .* in time/);
    });

    it("gives up on a handshake that never finishes, after the same timeout", async () => {
      const via = await proxy((_r, client) => {
        client.write("HTTP/1.1 200 OK\r\n\r\n");
      });
      const { http } = clientVia(via.port, { proxyConnectTimeoutMs: 100 });

      await expect(http.fetch("https://model.test/")).rejects.toThrow(/didn't answer .* in time/);
    });

    it("stops waiting for a silent proxy when the caller's signal aborts, with the caller's reason", async () => {
      const via = await proxy(() => {});
      const { http } = clientVia(via.port);
      const controller = new AbortController();
      const reason = new Error("caller gave up");

      const request = http.fetch("https://model.test/", { signal: controller.signal });
      setTimeout(() => controller.abort(reason), 30);

      await expect(request).rejects.toBe(reason);
    });

    it("stops a handshake that never finishes when the caller's signal aborts, with the caller's reason", async () => {
      const via = await proxy((_r, client) => {
        client.write("HTTP/1.1 200 OK\r\n\r\n");
      });
      const { http } = clientVia(via.port);
      const controller = new AbortController();
      const reason = new Error("caller gave up");

      const request = http.fetch("https://model.test/", { signal: controller.signal });
      setTimeout(() => controller.abort(reason), 50);

      await expect(request).rejects.toBe(reason);
    });

    it("never reaches a name that isn't a plain host, with no CR or LF on the CONNECT line (attack 10)", async () => {
      const via = await proxy(tunnelTo({}));
      const { http } = clientVia(via.port);

      await expect(http.fetch("https://model.test%0d%0aX:y/")).rejects.toThrow();
      expect(via.connects).toHaveLength(0);
    });

    it("refuses a host name that isn't plain before anything is sent, even past URL parsing (attack 10)", async () => {
      const via = await proxy(tunnelTo({}));
      const result = ProxyEndpoint.parse(`http://127.0.0.1:${via.port}`);
      if (result.kind !== "proxy") throw new Error("the fixture's proxy setting should parse");

      await expect(
        openTunnel({
          proxy: result.endpoint,
          lookup: fixedLookup(["127.0.0.1"]),
          target: { hostname: "model.test\r\nX: y", port: 443 },
          connectTimeoutMs: 1_000,
          signal: undefined,
        }),
      ).rejects.toThrow(/not a host name a proxy can be asked for/);
      expect(via.connects).toHaveLength(0);
    });
  });
});
