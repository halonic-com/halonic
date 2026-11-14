import type { PasswordHasher } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { answerSelfTest, signInRuns } from "./self-test.ts";
import { worker } from "./worker.ts";

const token = ["deploy", "token", "for", "one", "upload"].join("-");
const namespace = { idFromName: (name: string) => name, get: () => ({}) };
const secrets = {
  HALONIC_SECRET_TOKEN_KEY: "a-secret-value",
  HALONIC_SECRET_SERVE_PASSWORD: "another-secret-value",
};

function bindings(overrides: Record<string, unknown> = {}) {
  return {
    COORDINATION: namespace,
    RUN: namespace,
    ROUTINES: namespace,
    DB: { prepare: () => ({ first: async () => ({ one: 1 }) }) },
    BLOBS: { head: async () => null },
    DEFINITIONS: {},
    ...secrets,
    HALONIC_SELFTEST_TOKEN: token,
    ...overrides,
  };
}

function hasher(verifyAnswer = true) {
  let verifies = 0;
  const passwords: PasswordHasher = {
    hash: async () => "stored",
    verify: async () => {
      verifies += 1;
      return verifyAnswer;
    },
    needsRehash: () => false,
  };
  return { passwords, runs: () => verifies };
}

function call(env: object, headers: Record<string, string> = {}, method = "POST") {
  const { passwords } = hasher();
  return answerSelfTest(
    new Request("https://cloud.example/self-test", { method, headers }),
    env,
    passwords,
  );
}

const authorized = { authorization: `Bearer ${token}` };

verifies("runtime.self-test", () => {
  describe("who may call it", () => {
    it("doesn't exist without the token variable", async () => {
      expect(
        await call(bindings({ HALONIC_SELFTEST_TOKEN: undefined }), authorized),
      ).toBeUndefined();
      expect(await call(bindings({ HALONIC_SELFTEST_TOKEN: "" }), authorized)).toBeUndefined();
    });

    it("falls through to a 404 in the Worker", async () => {
      const env = bindings({ HALONIC_SELFTEST_TOKEN: undefined });
      const response = await worker.fetch(
        new Request("https://cloud.example/self-test", { method: "POST", headers: authorized }),
        env as never,
      );
      expect(response.status).toBe(404);
    });

    it.each([{}, { authorization: "Bearer wrong" }, { authorization: token }])(
      "refuses %j with 401",
      async (headers) => {
        const response = await call(bindings(), headers);
        expect(response?.status).toBe(401);
        expect(await response?.json()).toMatchObject({ code: "unauthorized" });
      },
    );

    it("answers GET with 405 and what is allowed", async () => {
      const response = await call(bindings(), authorized, "GET");
      expect(response?.status).toBe(405);
      expect(response?.headers.get("allow")).toBe("POST");
    });
  });

  describe("the checks", () => {
    it("passes a healthy deployment and verifies the password five times", async () => {
      const { passwords, runs } = hasher();
      const response = await answerSelfTest(
        new Request("https://cloud.example/self-test", { method: "POST", headers: authorized }),
        bindings() as never,
        passwords,
      );
      expect(response?.status).toBe(200);
      expect(await response?.json()).toEqual({
        ok: true,
        checks: [
          { name: "configuration", ok: true },
          { name: "database", ok: true },
          { name: "blobs", ok: true },
          { name: "sign-in", ok: true },
        ],
      });
      expect(runs()).toBe(signInRuns);
    });

    it("fails the database check when D1 throws, and tells nothing more", async () => {
      const env = bindings({
        DB: {
          prepare: () => {
            throw new Error(`no access with ${token}`);
          },
        },
      });
      const response = await call(env, authorized);
      const text = await response?.text();
      expect(response?.status).toBe(200);
      expect(JSON.parse(text ?? "")).toMatchObject({
        ok: false,
        checks: expect.arrayContaining([{ name: "database", ok: false }]),
      });
      expect(text).not.toContain(token);
      expect(text).not.toContain("no access");
    });

    it("fails the blobs check when R2 throws", async () => {
      const env = bindings({
        BLOBS: {
          head: async () => {
            throw new Error("down");
          },
        },
      });
      const report = await (await call(env, authorized))?.json();
      expect(report).toMatchObject({
        ok: false,
        checks: expect.arrayContaining([{ name: "blobs", ok: false }]),
      });
    });

    it("fails the configuration check when a secret is missing, without naming it", async () => {
      const env = bindings({ HALONIC_SECRET_TOKEN_KEY: undefined });
      const text = await (await call(env, authorized))?.text();
      expect(JSON.parse(text ?? "")).toMatchObject({
        checks: expect.arrayContaining([{ name: "configuration", ok: false }]),
      });
      expect(text).not.toContain("token-key");
    });

    it("fails the sign-in check when the hash doesn't verify", async () => {
      const { passwords } = hasher(false);
      const response = await answerSelfTest(
        new Request("https://cloud.example/self-test", { method: "POST", headers: authorized }),
        bindings() as never,
        passwords,
      );
      expect(await response?.json()).toMatchObject({
        ok: false,
        checks: expect.arrayContaining([{ name: "sign-in", ok: false }]),
      });
    });
  });
});
