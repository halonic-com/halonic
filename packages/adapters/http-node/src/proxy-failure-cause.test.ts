import { verifies } from "@halonicjs/testing-spec";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { fakeResolver } from "./loopback-server.test-helper.ts";
import { createNodeHttpClient } from "./node-http-client.ts";
import { ProxyError } from "./proxy-error.ts";
import {
  type ConnectAnswer,
  type ProxyFixture,
  startProxy,
  startTlsOrigin,
  trustCertificates,
  tunnelTo,
} from "./proxy-fixture.test-helper.ts";
import { proxyFromEnv } from "./proxy-from-env.ts";
import { selfSignedCertificate } from "./test-certificate.test-helper.ts";

const secret = "pa55-w0rd";
const strangerCertificate = selfSignedCertificate({ names: ["stranger.test"] });

let restoreTrust: () => void;
const stops: (() => Promise<void>)[] = [];

beforeAll(() => {
  restoreTrust = trustCertificates(strangerCertificate);
});

afterAll(() => restoreTrust());

afterEach(async () => {
  await Promise.all(stops.splice(0).map((stop) => stop()));
});

async function proxy(answer: ConnectAnswer): Promise<ProxyFixture> {
  const started = await startProxy(answer);
  stops.push(started.close);
  return started;
}

/** A proxy URL with credentials, built here so no literal one sits in the source. */
function withCredentials(port: number): string {
  return `http://${["me", secret].join(":")}${String.fromCharCode(64)}127.0.0.1:${port}`;
}

/** The error a request to `url` fails with, through the proxy that `env` sets. */
async function failureOf(
  env: Record<string, string>,
  url = "https://model.test/",
  extra: { proxyConnectTimeoutMs?: number } = {},
): Promise<ProxyError> {
  const http = createNodeHttpClient({
    hostClass: () => "public",
    resolve: fakeResolver({}).resolve,
    proxy: proxyFromEnv(env),
    ...extra,
  });
  const error = await http.fetch(url).then(
    () => undefined,
    (caught: unknown) => caught,
  );
  if (!(error instanceof ProxyError)) throw new Error(`expected a ProxyError, got ${error}`);
  return error;
}

verifies("http-node.proxy-failure-cause", () => {
  describe("the typed cause of each proxy failure", () => {
    it("names an unusable setting and the variable it came from", async () => {
      const error = await failureOf({ HTTPS_PROXY: "socks5://proxy.corp:1080" });

      expect(error).toMatchObject({
        kind: "invalid_input",
        failureCause: {
          code: "proxy.setting",
          detail: { variable: "HTTPS_PROXY", host: "model.test" },
        },
      });
    });

    it("names a setting without http:// the same way", async () => {
      const error = await failureOf({ https_proxy: "proxy.corp:3128" });

      expect(error.failureCause).toEqual({
        code: "proxy.setting",
        detail: { variable: "https_proxy", host: "model.test" },
      });
    });

    it("names a proxy that isn't running, as http://host:port", async () => {
      const via = await proxy(tunnelTo({}));
      await via.close();

      const error = await failureOf({ HTTPS_PROXY: withCredentials(via.port) });

      expect(error).toMatchObject({
        kind: "unavailable",
        failureCause: {
          code: "proxy.unreachable",
          detail: {
            variable: "HTTPS_PROXY",
            proxy: `http://127.0.0.1:${via.port}`,
            host: "model.test",
          },
        },
      });
    });

    it("names a proxy that never answers", async () => {
      const via = await proxy(() => {});

      const error = await failureOf({ HTTPS_PROXY: `http://127.0.0.1:${via.port}` }, undefined, {
        proxyConnectTimeoutMs: 50,
      });

      expect(error.failureCause.code).toBe("proxy.timeout");
    });

    it("names a refusal with the proxy's status", async () => {
      const via = await proxy((_r, c) => c.end("HTTP/1.1 403 Forbidden\r\n\r\n"));

      const error = await failureOf({ HTTPS_PROXY: `http://127.0.0.1:${via.port}` });

      expect(error).toMatchObject({
        kind: "denied",
        failureCause: { code: "proxy.refused", detail: { status: "403", host: "model.test" } },
      });
    });

    it("names a refused user name and password, without either", async () => {
      const via = await proxy((_r, c) =>
        c.end("HTTP/1.1 407 Proxy Authentication Required\r\n\r\n"),
      );

      const error = await failureOf({ HTTPS_PROXY: withCredentials(via.port) });

      expect(error).toMatchObject({
        kind: "unauthenticated",
        failureCause: { code: "proxy.credentials", detail: { status: "407" } },
      });
      expect(JSON.stringify(error.failureCause)).not.toContain(secret);
      expect(JSON.stringify(error.failureCause)).not.toContain("me:");
    });

    it("names a tunnel that failed its security check", async () => {
      const server = await startTlsOrigin(strangerCertificate);
      stops.push(server.close);
      const via = await proxy(tunnelTo({ [`model.test:${server.port}`]: server.port }));

      const error = await failureOf(
        { HTTPS_PROXY: `http://127.0.0.1:${via.port}` },
        `https://model.test:${server.port}/`,
      );

      expect(error.failureCause.code).toBe("proxy.insecure");
    });

    it("names a public http:// host and the variable that set the proxy", async () => {
      const via = await proxy(tunnelTo({}));

      const error = await failureOf(
        { https_proxy: `http://127.0.0.1:${via.port}` },
        "http://model.test:8080/",
      );

      expect(error).toMatchObject({
        kind: "denied",
        failureCause: {
          code: "proxy.plain-http",
          detail: { variable: "https_proxy", host: "model.test" },
        },
      });
      expect(via.connects).toHaveLength(0);
    });
  });
});
