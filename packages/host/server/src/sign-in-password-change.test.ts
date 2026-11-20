import type { Coordination } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Server } from "./api.ts";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

const host = "halonic.acme.example";

/** A server whose `serve-password` hash the test can set again, as `halonic secret set` does. */
function setup() {
  const clock = new TestClock();
  const coordination = new FakeCoordination(clock);
  const password = { hash: "hash:correct horse" };
  const server: Server = testServer({
    passwordHash: null,
    clock,
    passwordHasher: new FakePasswordHasher(),
    config: { maxBodyBytes: 4096 },
    coordination: coordination as unknown as Coordination,
    secrets: {
      get: async (name) => (name === "serve-password" ? password.hash : null),
    },
  });
  return { clock, coordination, password, server };
}

async function signIn(server: Server, password = "correct horse"): Promise<string> {
  const response = await server.handle(
    new Request(`https://${host}/api/login`, {
      method: "POST",
      headers: { host, "content-type": "application/json" },
      body: JSON.stringify({ password }),
    }),
  );
  expect(response.status).toBe(200);
  return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

function sessionStatus(server: Server, cookie: string): Promise<number> {
  return server
    .handle(new Request(`https://${host}/api/session`, { headers: { host, cookie } }))
    .then((response) => response.status);
}

function sessionKeys(coordination: FakeCoordination): string[] {
  return [...coordination.values.keys()].filter((key) => key.startsWith("session:"));
}

describe("sign-in after a password change", () => {
  verifies("server.sign-in", () => {
    it("ends every session when the password changes, and deletes it", async () => {
      const { coordination, password, server } = setup();
      const first = await signIn(server);
      const second = await signIn(server);
      password.hash = "hash:battery staple";
      expect(await sessionStatus(server, first)).toBe(401);
      expect(await sessionStatus(server, second)).toBe(401);
      expect(sessionKeys(coordination)).toEqual([]);
    });

    it("ends a session when the same password is set again with a new salt", async () => {
      const { password, server } = setup();
      const cookie = await signIn(server);
      // A real hasher salts every hash, so the same password gives a different hash.
      password.hash = "hash:correct horse;salt:2";
      expect(await sessionStatus(server, cookie)).toBe(401);
    });

    it("keeps a session while the password stays the same", async () => {
      const { server } = setup();
      const cookie = await signIn(server);
      expect(await sessionStatus(server, cookie)).toBe(200);
      expect(await sessionStatus(server, cookie)).toBe(200);
    });

    it("lets a new sign-in under the new password in", async () => {
      const { password, server } = setup();
      await signIn(server);
      password.hash = "hash:battery staple";
      expect(await sessionStatus(server, await signIn(server, "battery staple"))).toBe(200);
    });

    it("refuses and deletes a session stored in the old form, a plain end date", async () => {
      const { clock, coordination, server } = setup();
      const cookie = await signIn(server);
      const [key = ""] = sessionKeys(coordination);
      const later = new Date(clock.now().getTime() + 24 * 60 * 60 * 1000).toISOString();
      coordination.values.set(key, later);
      expect(await sessionStatus(server, cookie)).toBe(401);
      expect(sessionKeys(coordination)).toEqual([]);
    });

    it("keeps no more of the password than a short fingerprint of its hash", async () => {
      const { coordination, server } = setup();
      await signIn(server);
      const [key = ""] = sessionKeys(coordination);
      const stored = JSON.parse(coordination.values.get(key) ?? "null") as Record<string, string>;
      expect(Object.keys(stored).sort()).toEqual(["expiresAt", "password"]);
      expect(stored["password"]).toMatch(/^[0-9a-f]{16}$/);
      expect(JSON.stringify(stored)).not.toContain("correct horse");
    });

    it("ends an old-form session on logout", async () => {
      const { coordination, server } = setup();
      const cookie = await signIn(server);
      const [key = ""] = sessionKeys(coordination);
      coordination.values.set(key, "2026-12-12T10:00:00.000Z");
      const out = await server.handle(
        new Request(`https://${host}/api/logout`, { method: "POST", headers: { host, cookie } }),
      );
      expect(out.status).toBe(204);
      expect(sessionKeys(coordination)).toEqual([]);
    });
  });
});
