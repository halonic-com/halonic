import type { Coordination } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { createSignIn, type SignIn } from "./sign-in.ts";
import { sessionGenerationKey } from "./stored-session.ts";
import { FakeCoordination, FakePasswordHasher, TestClock } from "./test-server.ts";

const host = "halonic.acme.example";
const context = {};

function setup() {
  const clock = new TestClock();
  const coordination = new FakeCoordination(clock);
  const signIn = createSignIn({
    clock,
    coordination: coordination as unknown as Coordination,
    passwordHasher: new FakePasswordHasher(),
    secrets: { get: async (name) => (name === "serve-password" ? "hash:correct horse" : null) },
  });
  return { coordination, signIn };
}

async function signInCookie(signIn: SignIn): Promise<string> {
  const request = new Request(`https://${host}/api/login`, {
    method: "POST",
    headers: { host, "content-type": "application/json" },
  });
  const body = new TextEncoder().encode(JSON.stringify({ password: "correct horse" }));
  const response = await signIn.login(request, body, context);
  expect(response.status).toBe(200);
  return (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
}

/** Whether the cookie is signed in, after checking that both ways of asking agree. */
async function isLive(signIn: SignIn, cookie: string): Promise<boolean> {
  const request = () => new Request(`https://${host}/api/session`, { headers: { host, cookie } });
  const signedIn = await signIn.isSignedIn(request(), context);
  const session = await signIn.session(request(), context);
  expect(session !== null).toBe(signedIn);
  return signedIn;
}

function sessionKeys(coordination: FakeCoordination): string[] {
  return [...coordination.values.keys()].filter((key) => key.startsWith("session:"));
}

describe("revoking every session", () => {
  verifies("server.session-revoke", () => {
    it("keeps a session from before any revoke live until the first one, then ends and deletes it", async () => {
      const { coordination, signIn } = setup();
      const cookie = await signInCookie(signIn);
      const [key = ""] = sessionKeys(coordination);
      expect(Object.keys(JSON.parse(coordination.values.get(key) ?? "{}"))).not.toContain(
        "generation",
      );
      expect(await isLive(signIn, cookie)).toBe(true);
      await signIn.revokeAllSessions();
      expect(await isLive(signIn, cookie)).toBe(false);
      expect(sessionKeys(coordination)).toEqual([]);
    });

    it("keeps a session started after a revoke, and ends it at the next one", async () => {
      const { signIn } = setup();
      await signIn.revokeAllSessions();
      const cookie = await signInCookie(signIn);
      expect(await isLive(signIn, cookie)).toBe(true);
      await signIn.revokeAllSessions();
      expect(await isLive(signIn, cookie)).toBe(false);
    });

    it("ends every session at once", async () => {
      const { signIn } = setup();
      const first = await signInCookie(signIn);
      await signIn.revokeAllSessions();
      const second = await signInCookie(signIn);
      const third = await signInCookie(signIn);
      await signIn.revokeAllSessions();
      for (const cookie of [first, second, third]) {
        expect(await isLive(signIn, cookie)).toBe(false);
      }
    });

    it("ends a session whose generation isn't text", async () => {
      const { coordination, signIn } = setup();
      await signIn.revokeAllSessions();
      const cookie = await signInCookie(signIn);
      const [key = ""] = sessionKeys(coordination);
      const stored = JSON.parse(coordination.values.get(key) ?? "{}") as Record<string, unknown>;
      coordination.values.set(key, JSON.stringify({ ...stored, generation: 1 }));
      expect(await isLive(signIn, cookie)).toBe(false);
      expect(sessionKeys(coordination)).toEqual([]);
    });

    it("leaves one new generation when two revokes run at once", async () => {
      const { coordination, signIn } = setup();
      await signIn.revokeAllSessions();
      const before = coordination.values.get(sessionGenerationKey);
      const cookie = await signInCookie(signIn);
      await Promise.all([signIn.revokeAllSessions(), signIn.revokeAllSessions()]);
      const after = coordination.values.get(sessionGenerationKey);
      expect(after).toMatch(/^[0-9a-f]{32}$/);
      expect(after).not.toBe(before);
      expect(await isLive(signIn, cookie)).toBe(false);
    });
  });
});
