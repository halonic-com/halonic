import type { Coordination } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Server } from "./api.ts";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

const host = "halonic.acme.example";
const cookieName = "__Host-halonic-session";
const plainCookieName = "halonic-session";

function setup(passwordHash: string | null = "hash:correct horse") {
  const clock = new TestClock();
  const coordination = new FakeCoordination(clock);
  const passwordHasher = new FakePasswordHasher();
  const server: Server = testServer({
    passwordHash,
    clock,
    passwordHasher,
    config: { maxBodyBytes: 4096 },
    coordination: coordination as unknown as Coordination,
  });
  return { clock, coordination, passwordHasher, server };
}

function login(
  server: Server,
  body: unknown,
  type = "application/json",
  scheme = "https",
): Promise<Response> {
  return server.handle(
    new Request(`${scheme}://${host}/api/login`, {
      method: "POST",
      headers: { host, "content-type": type },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function get(server: Server, path: string, cookie?: string, scheme = "https"): Promise<Response> {
  const headers: Record<string, string> = { host };
  if (cookie !== undefined) headers["cookie"] = cookie;
  return server.handle(new Request(`${scheme}://${host}${path}`, { headers }));
}

/** The `name=value` part of the cookie a sign-in set. */
function sessionCookieOf(response: Response): string {
  const header = response.headers.get("set-cookie") ?? "";
  return header.split(";")[0] ?? "";
}

describe("sign-in", () => {
  verifies("server.sign-in", () => {
    it("starts a session for the right password and refuses a wrong one", async () => {
      const { server } = setup();
      const wrong = await login(server, { password: "nope" });
      expect(wrong.status).toBe(401);
      expect(await wrong.json()).toMatchObject({ code: "wrong_password" });
      expect(wrong.headers.get("set-cookie")).toBeNull();

      const right = await login(server, { password: "correct horse" });
      expect(right.status).toBe(200);
      expect(await right.json()).toEqual({ signedIn: true });
      expect(right.headers.get("set-cookie")).toContain(cookieName);
    });

    it("refuses a malformed body without checking the password", async () => {
      const { server, passwordHasher } = setup();
      const bodies: Array<[unknown, string?]> = [
        ["not json"],
        [{ password: 5 }],
        [{ password: "" }],
        [{ password: "x".repeat(1025) }],
        [null],
        [{ password: "correct horse" }, "text/plain"],
        [{ password: "correct horse" }, "application/jsonx"],
      ];
      for (const [body, type] of bodies) {
        const response = await login(server, body, type);
        expect(response.status, JSON.stringify(body)).toBe(400);
      }
      expect(passwordHasher.verifyCalls).toBe(0);
    });

    it("answers 404 when no password is configured", async () => {
      const { server } = setup(null);
      const response = await server.handle(
        new Request("http://localhost/api/login", {
          method: "POST",
          headers: { host: "localhost", "content-type": "application/json" },
          body: JSON.stringify({ password: "anything" }),
        }),
      );
      expect(response.status).toBe(404);
    });

    it("ends the session on logout and clears the cookie", async () => {
      const { server } = setup();
      const cookie = sessionCookieOf(await login(server, { password: "correct horse" }));
      expect((await get(server, "/api/session", cookie)).status).toBe(200);

      const out = await server.handle(
        new Request(`https://${host}/api/logout`, { method: "POST", headers: { host, cookie } }),
      );
      expect(out.status).toBe(204);
      expect(out.headers.get("set-cookie")).toContain("Max-Age=0");
      expect((await get(server, "/api/session", cookie)).status).toBe(401);
    });
  });

  verifies("server.session", () => {
    it("sets a __Host- cookie that is Secure, HttpOnly and SameSite=Strict", async () => {
      const { server } = setup();
      const header = (await login(server, { password: "correct horse" })).headers.get("set-cookie");
      expect(header).toMatch(new RegExp(`^${cookieName}=[0-9a-f]{64}; `));
      for (const attribute of ["Path=/", "Secure", "HttpOnly", "SameSite=Strict"]) {
        expect(header, attribute).toContain(attribute);
      }
      expect(header).not.toContain("Domain");
    });

    it("sets a plain cookie without Secure over HTTP, and reads and clears it", async () => {
      const { server } = setup();
      const response = await login(server, { password: "correct horse" }, undefined, "http");
      const header = response.headers.get("set-cookie");
      expect(header).toMatch(new RegExp(`^${plainCookieName}=[0-9a-f]{64}; `));
      for (const attribute of ["Path=/", "HttpOnly", "SameSite=Strict"]) {
        expect(header, attribute).toContain(attribute);
      }
      expect(header).not.toContain("Secure");
      expect(header).not.toContain("__Host-");

      const cookie = sessionCookieOf(response);
      expect((await get(server, "/api/session", cookie, "http")).status).toBe(200);
      const out = await server.handle(
        new Request(`http://${host}/api/logout`, { method: "POST", headers: { host, cookie } }),
      );
      expect(out.headers.get("set-cookie")).toMatch(
        new RegExp(`^${plainCookieName}=; .*Max-Age=0`),
      );
      expect((await get(server, "/api/session", cookie, "http")).status).toBe(401);
    });

    it("ignores the cookie of the other scheme", async () => {
      const { server } = setup();
      const secure = sessionCookieOf(await login(server, { password: "correct horse" }));
      const plain = sessionCookieOf(
        await login(server, { password: "correct horse" }, undefined, "http"),
      );
      expect((await get(server, "/api/session", secure, "http")).status).toBe(401);
      expect((await get(server, "/api/session", plain, "https")).status).toBe(401);
    });

    it("deletes a session once it has ended", async () => {
      const { server, clock, coordination } = setup();
      const cookie = sessionCookieOf(await login(server, { password: "correct horse" }));
      clock.advance(31 * 24 * 60 * 60 * 1000);
      expect((await get(server, "/api/session", cookie)).status).toBe(401);
      expect([...coordination.values.keys()].filter((key) => key.startsWith("session:"))).toEqual(
        [],
      );
    });

    it("gives every sign-in its own token and stores only a hash of it", async () => {
      const { server, coordination } = setup();
      const first = sessionCookieOf(await login(server, { password: "correct horse" }));
      const second = sessionCookieOf(await login(server, { password: "correct horse" }));
      expect(first).not.toBe(second);
      const keys = [...coordination.values.keys()].filter((key) => key.startsWith("session:"));
      expect(keys).toHaveLength(2);
      const token = first.slice(cookieName.length + 1);
      for (const key of keys) {
        expect(key).not.toContain(token);
        expect(key).toMatch(/^session:[0-9a-f]{64}$/);
      }
    });

    it("lasts 30 days", async () => {
      const { server, clock } = setup();
      const cookie = sessionCookieOf(await login(server, { password: "correct horse" }));
      const day = 24 * 60 * 60 * 1000;
      clock.advance(29 * day);
      expect((await get(server, "/api/session", cookie)).status).toBe(200);
      clock.advance(2 * day);
      expect((await get(server, "/api/session", cookie)).status).toBe(401);
    });

    it("refuses a missing, forged or unknown cookie on a route behind the sign-in", async () => {
      const { server } = setup();
      for (const cookie of [undefined, `${cookieName}=`, `${cookieName}=forged`, "other=1"]) {
        const response = await get(server, "/api/session", cookie);
        expect(response.status, String(cookie)).toBe(401);
        expect(await response.json()).toMatchObject({ code: "not_signed_in" });
      }
    });

    it("treats every request as signed in when no password is configured", async () => {
      const { server } = setup(null);
      const response = await server.handle(
        new Request("http://localhost/api/session", { headers: { host: "localhost" } }),
      );
      expect(response.status).toBe(200);
    });
  });

  verifies("server.login-limit", () => {
    it("stops after 10 attempts in a window without checking the password again", async () => {
      const { server, passwordHasher } = setup();
      for (let attempt = 0; attempt < 10; attempt += 1) {
        expect((await login(server, { password: "nope" })).status).toBe(401);
      }
      const blocked = await login(server, { password: "correct horse" });
      expect(blocked.status).toBe(429);
      expect(await blocked.json()).toMatchObject({ code: "too_many_attempts" });
      expect(passwordHasher.verifyCalls).toBe(10);
    });

    it("tells the caller how long to wait", async () => {
      const { server, clock } = setup();
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await login(server, { password: "nope" });
      }
      clock.advance(5 * 60 * 1000);
      const blocked = await login(server, { password: "nope" });
      expect(blocked.headers.get("retry-after")).toBe(String(10 * 60));
    });

    it("checks passwords again once the window has ended", async () => {
      const { server, clock } = setup();
      for (let attempt = 0; attempt < 10; attempt += 1) {
        await login(server, { password: "nope" });
      }
      clock.advance(15 * 60 * 1000);
      expect((await login(server, { password: "correct horse" })).status).toBe(200);
    });

    it("does not count a malformed request", async () => {
      const { server } = setup();
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await login(server, "not json");
      }
      expect((await login(server, { password: "correct horse" })).status).toBe(200);
    });
  });
});
