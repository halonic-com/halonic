import { bytesToHex } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type AdminRoute, answerAdmin } from "./admin.ts";
import { adminRoutes } from "./admin-routes.ts";
import type { RuntimeEnv } from "./env.ts";
import { worker } from "./worker.ts";

const host = "halonic.example.com";
const key = ["one", "job", "admin", "key", "for", "this", "test"].join("-");

async function hashOf(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return bytesToHex(new Uint8Array(digest));
}

const namespace = { idFromName: (name: string) => name, get: () => ({}) };
async function envWithKey(overrides: Record<string, unknown> = {}): Promise<RuntimeEnv> {
  return {
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
    HALONIC_SECRET_ADMIN_KEY_HASH: await hashOf(key),
    ...overrides,
  } as unknown as RuntimeEnv;
}

function call(
  path: string,
  headers: Record<string, string> = { authorization: `Bearer ${key}` },
  method = "GET",
) {
  return new Request(`https://${host}${path}`, { method, headers: { host, ...headers } });
}

const recording: AdminRoute[] = [
  { method: "GET", path: "/admin/ping", handler: () => Response.json({ pong: true }) },
  {
    method: "PUT",
    path: "/admin/files",
    below: true,
    handler: () => Response.json({ stored: true }),
  },
];

verifies("runtime.admin-key", () => {
  describe("a deployment without the key", () => {
    it("has no admin route: the same 404 as any unknown path", async () => {
      const env = await envWithKey({ HALONIC_SECRET_ADMIN_KEY_HASH: undefined });
      expect(await answerAdmin(call("/admin/ping"), env, recording)).toBeUndefined();
      const response = await worker.fetch(call("/admin/export"), env);
      const unknown = await worker.fetch(call("/health/"), env);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual(await unknown.json());
    });

    it("ignores a path that is not an admin path", async () => {
      expect(await answerAdmin(call("/api/hello"), await envWithKey(), recording)).toBeUndefined();
      expect(await answerAdmin(call("/admin"), await envWithKey(), recording)).toBeUndefined();
    });
  });

  describe("who reaches a route", () => {
    it("answers the right key on a listed host", async () => {
      const response = await answerAdmin(call("/admin/ping"), await envWithKey(), recording);
      expect(response?.status).toBe(200);
      expect(await response?.json()).toEqual({ pong: true });
    });

    it.each([
      ["no header", {}],
      ["another scheme", { authorization: `Basic ${key}` }],
      ["a wrong key", { authorization: "Bearer not-the-key" }],
      ["a longer key", { authorization: `Bearer ${key}x` }],
      ["a shorter key", { authorization: `Bearer ${key.slice(1)}` }],
      ["only the scheme", { authorization: "Bearer " }],
    ])("refuses %s with 401 and a fixed message", async (_name, headers) => {
      const response = await answerAdmin(
        call("/admin/ping", headers),
        await envWithKey(),
        recording,
      );
      const text = (await response?.text()) ?? "";
      expect(response?.status).toBe(401);
      expect(JSON.parse(text)).toEqual({
        code: "unauthorized",
        message: "This address needs the admin key.",
      });
      expect(text).not.toContain(key);
    });

    it("never reads the key from the URL", async () => {
      const response = await answerAdmin(
        call(`/admin/ping?key=${key}`, {}),
        await envWithKey(),
        recording,
      );
      expect(response?.status).toBe(401);
    });

    it("accepts the stored hash in upper case", async () => {
      const env = await envWithKey({
        HALONIC_SECRET_ADMIN_KEY_HASH: (await hashOf(key)).toUpperCase(),
      });
      expect((await answerAdmin(call("/admin/ping"), env, recording))?.status).toBe(200);
    });

    it.each([
      [
        "the preview address",
        { host: "v1.halonic.workers.dev", authorization: `Bearer ${key}` },
        421,
      ],
      ["a request a page sent", { origin: `https://${host}`, authorization: `Bearer ${key}` }, 404],
    ])("lets %s fall through to host/server, which refuses it", async (_name, headers, status) => {
      const env = await envWithKey();
      expect(await answerAdmin(call("/admin/ping", headers), env, recording)).toBeUndefined();
      const response = await worker.fetch(call("/admin/export", headers), env);
      expect(response.status).toBe(status);
    });

    it("falls through when the deployment's host names aren't configured", async () => {
      const env = await envWithKey({ HALONIC_ALLOWED_HOSTS: undefined });
      expect(await answerAdmin(call("/admin/ping"), env, recording)).toBeUndefined();
    });
  });

  describe("the routes", () => {
    it("answers 404 for an admin path no route takes, and for the wrong method", async () => {
      const env = await envWithKey();
      expect((await answerAdmin(call("/admin/nothing"), env, recording))?.status).toBe(404);
      expect(
        (await answerAdmin(call("/admin/ping", undefined, "POST"), env, recording))?.status,
      ).toBe(404);
    });

    it("answers everything below a folder route, but not the folder itself", async () => {
      const env = await envWithKey();
      const put = (path: string) =>
        answerAdmin(call(path, { authorization: `Bearer ${key}` }, "PUT"), env, recording);
      expect((await put("/admin/files/runs/r1.jsonl"))?.status).toBe(200);
      expect((await put("/admin/files"))?.status).toBe(404);
      expect((await put("/admin/files/"))?.status).toBe(404);
    });

    it("answers 501 on every export and import route until they are built", async () => {
      const env = await envWithKey();
      for (const [method, path] of [
        ["GET", "/admin/export"],
        ["GET", "/admin/export/files/runs/r1.jsonl"],
        ["PUT", "/admin/import/files/runs/r1.jsonl"],
        ["POST", "/admin/import"],
      ] as const) {
        const response = await worker.fetch(
          call(path, { authorization: `Bearer ${key}` }, method),
          env,
        );
        expect(response.status, `${method} ${path}`).toBe(501);
        expect(adminRoutes.length).toBe(4);
      }
    });
  });
});
