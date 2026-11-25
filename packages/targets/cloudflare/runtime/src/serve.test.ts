import { runExecutorVersion } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { ConfigurationError, type RuntimeEnv } from "./env.ts";
import { serverPortsOf } from "./serve.ts";
import { serverConfigOf } from "./serve-config.ts";
import { worker } from "./worker.ts";

const namespace = { idFromName: (name: string) => name, get: () => ({}) };
const complete = {
  COORDINATION: namespace,
  RUN: namespace,
  ROUTINES: namespace,
  DB: {},
  BLOBS: {},
  DEFINITIONS: {},
  HALONIC_SECRET_TOKEN_KEY: "a-secret-value",
  HALONIC_SECRET_SERVE_PASSWORD: "another-secret-value",
  HALONIC_ALLOWED_HOSTS: "halonic.example.com, Other.example.com",
  HALONIC_DEPLOYMENT_ID: "main",
};

function envWith(overrides: Record<string, unknown>): RuntimeEnv {
  return { ...complete, ...overrides } as unknown as RuntimeEnv;
}

function ask(env: RuntimeEnv, path: string, host = "halonic.example.com"): Promise<Response> {
  return worker.fetch(new Request(`https://${host}${path}`, { headers: { host } }), env);
}

verifies("runtime.serve", () => {
  describe("the configuration of the API", () => {
    it("reads the host names, trimmed, and the deployment id", () => {
      expect(serverConfigOf(complete)).toMatchObject({
        deploymentId: "main",
        allowedHosts: ["halonic.example.com", "Other.example.com"],
      });
      expect(serverConfigOf(complete)).not.toHaveProperty("dailyRequests");
    });

    it("reads the daily ceiling when there is one", () => {
      expect(serverConfigOf({ ...complete, HALONIC_DAILY_REQUESTS: "50" })).toMatchObject({
        dailyRequests: 50,
      });
    });

    it.each([
      [{ HALONIC_ALLOWED_HOSTS: undefined }, ["HALONIC_ALLOWED_HOSTS"]],
      [{ HALONIC_ALLOWED_HOSTS: " , " }, ["HALONIC_ALLOWED_HOSTS"]],
      [{ HALONIC_DEPLOYMENT_ID: "" }, ["HALONIC_DEPLOYMENT_ID"]],
      [{ HALONIC_DAILY_REQUESTS: "0" }, ["HALONIC_DAILY_REQUESTS"]],
      [{ HALONIC_DAILY_REQUESTS: "many" }, ["HALONIC_DAILY_REQUESTS"]],
      [
        { HALONIC_ALLOWED_HOSTS: undefined, HALONIC_DEPLOYMENT_ID: undefined },
        ["HALONIC_ALLOWED_HOSTS", "HALONIC_DEPLOYMENT_ID"],
      ],
    ])("refuses %j, naming %j", (overrides, names) => {
      const error = (() => {
        try {
          serverConfigOf({ ...complete, ...overrides });
          return undefined;
        } catch (caught) {
          return caught;
        }
      })();
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as ConfigurationError).missing).toEqual(names);
    });
  });

  describe("an incomplete deployment", () => {
    it.each([
      { HALONIC_ALLOWED_HOSTS: undefined },
      { BLOBS: undefined },
      { HALONIC_SECRET_SERVE_PASSWORD: undefined },
    ])("answers 503 and names nothing when %j is missing", async (overrides) => {
      const response = await ask(envWith(overrides), "/api/hello");
      const text = await response.text();
      expect(response.status).toBe(503);
      expect(JSON.parse(text)).toEqual({ code: "unavailable", message: "The server isn't ready." });
      expect(text).not.toContain("HALONIC");
      expect(text).not.toContain("BLOBS");
    });

    it("still answers the health route", async () => {
      expect((await ask(envWith({ HALONIC_ALLOWED_HOSTS: undefined }), "/health")).status).toBe(
        200,
      );
    });
  });

  describe("the API behind the Worker", () => {
    it("answers hello on a listed host, in any letter case", async () => {
      const response = await ask(envWith({}), "/api/hello", "halonic.example.com");
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        product: "halonic",
        version: "0.1.0",
        minAppVersion: "0.1.0",
        runExecutorVersion,
        mode: "owner",
        minStudioVersion: "0.1.0",
      });
      expect((await ask(envWith({}), "/api/hello", "OTHER.example.com")).status).toBe(200);
    });

    it.each(["halonic-halonic-cloud.preview.workers.dev", "evil.example.com", "localhost"])(
      "gives host %s no API unless it is a loopback name",
      async (host) => {
        const response = await ask(envWith({}), "/api/hello", host);
        expect(response.status).toBe(host === "localhost" ? 200 : 421);
        if (host !== "localhost")
          expect(await response.json()).toMatchObject({ code: "host_not_allowed" });
      },
    );

    it("reads the scheme from the request, so a plain-http request gets no Secure cookie", async () => {
      // Plain http reaches the API only on a loopback name, as under `wrangler dev` (`runtime.https-only`).
      const send = (scheme: string, host: string) =>
        worker.fetch(
          new Request(`${scheme}://${host}/api/logout`, { method: "POST", headers: { host } }),
          envWith({}),
        );
      const secure = await send("https", "halonic.example.com");
      const plain = await send("http", "localhost");
      expect(secure.headers.get("set-cookie")).toContain("Secure");
      expect(plain.headers.get("set-cookie")).not.toContain("Secure");
    });

    it("answers an unknown path with the neutral 404 the health route gives", async () => {
      const unknown = await ask(envWith({}), "/api/nothing-here");
      const neutral = await ask(envWith({}), "/health/");
      expect(unknown.status).toBe(404);
      expect(await unknown.json()).toEqual(await neutral.json());
    });
  });

  describe("the runs behind the API", () => {
    it("are the Worker's own executor unless a test sets another", () => {
      const runtime = { runEvents: {} } as unknown as Parameters<typeof serverPortsOf>[0];
      expect(serverPortsOf(runtime).runs.id).toBe("cloudflare-worker");
    });
  });
});
