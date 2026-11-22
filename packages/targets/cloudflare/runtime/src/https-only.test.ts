import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { RuntimeEnv } from "./env.ts";
import { worker } from "./worker.ts";

const host = "halonic.example.com";
const namespace = { idFromName: (name: string) => name, get: () => ({}) };
const env = {
  COORDINATION: namespace,
  RUN: namespace,
  ROUTINES: namespace,
  DB: {},
  BLOBS: {},
  DEFINITIONS: {},
  HALONIC_SECRET_TOKEN_KEY: "a-secret-value",
  HALONIC_SECRET_SERVE_PASSWORD: "another-secret-value",
  HALONIC_ALLOWED_HOSTS: host,
  HALONIC_DEPLOYMENT_ID: "main",
} as unknown as RuntimeEnv;

function signIn(url: string, requestHost = host): Request {
  return new Request(url, {
    method: "POST",
    headers: { host: requestHost, "content-type": "application/json" },
    body: JSON.stringify({ password: "a password made up for this test" }),
  });
}

verifies("runtime.https-only", () => {
  describe("a plain-http request to the deployment's name", () => {
    it.each(["GET", "HEAD"])("sends %s to the same address over HTTPS", async (method) => {
      const response = await worker.fetch(
        new Request(`http://${host}/api/hello?x=1`, { method, headers: { host } }),
        env,
      );
      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(`https://${host}/api/hello?x=1`);
    });

    it("refuses a sign-in without reading it or setting a cookie", async () => {
      const request = signIn(`http://${host}/api/login`);
      const response = await worker.fetch(request, env);
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ code: "https_required" });
      expect(response.headers.get("set-cookie")).toBeNull();
      expect(request.bodyUsed).toBe(false);
    });

    it.each(["/health", "/self-test", "/admin/export", "/api/logout"])(
      "refuses a POST to %s before any route answers",
      async (path) => {
        const response = await worker.fetch(
          new Request(`http://${host}${path}`, { method: "POST", headers: { host } }),
          env,
        );
        expect(response.status).toBe(403);
        expect(response.headers.get("set-cookie")).toBeNull();
      },
    );
  });

  describe("requests that go on", () => {
    it("serves the deployment's name over HTTPS, with a Secure session cookie", async () => {
      const logout = await worker.fetch(
        new Request(`https://${host}/api/logout`, { method: "POST", headers: { host } }),
        env,
      );
      expect(logout.headers.get("set-cookie")).toContain("Secure");
    });

    it.each(["localhost:8787", "127.0.0.1:8787", "[::1]:8787"])(
      "serves plain http on the loopback name %s, as under wrangler dev",
      async (loopback) => {
        const response = await worker.fetch(
          new Request(`http://${loopback}/api/hello`, { headers: { host: loopback } }),
          env,
        );
        expect(response.status).toBe(200);
      },
    );
  });
});
