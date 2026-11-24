import type { Coordination } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { RequestCountStore } from "./api.ts";
import { MemoryRequestCountStore } from "./memory-request-count-store.ts";
import { FakeCoordination, FakePasswordHasher, TestClock, testServer } from "./test-server.ts";

const host = "halonic.acme.example";

/** A server with a password, a session for it, and requests that carry that session by default. */
async function setup(dailyRequests: number | undefined, requestCounts: RequestCountStore) {
  const clock = new TestClock();
  // The sign-in itself isn't counted, so the session costs none of the day's requests.
  const server = testServer({
    passwordHash: "hash:pw",
    clock,
    requestCounts,
    passwordHasher: new FakePasswordHasher(),
    coordination: new FakeCoordination(clock) as unknown as Coordination,
    config: { allowedHosts: [host], ...(dailyRequests === undefined ? {} : { dailyRequests }) },
  });
  const login = await server.handle(
    new Request(`https://${host}/api/login`, {
      method: "POST",
      headers: { host, "content-type": "application/json" },
      body: JSON.stringify({ password: "pw" }),
    }),
  );
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const ask = (path = "/api/session", requestHost = host) =>
    server.handle(
      new Request(`https://${requestHost}${path}`, { headers: { host: requestHost, cookie } }),
    );
  const askAnonymously = (path: string) =>
    server.handle(new Request(`https://${host}${path}`, { headers: { host } }));
  return { clock, ask, askAnonymously };
}

describe("daily requests", () => {
  verifies("server.daily-requests", () => {
    it("answers 429 with a Retry-After to the request after the ceiling", async () => {
      const { ask } = await setup(3, new MemoryRequestCountStore());
      for (let call = 0; call < 3; call += 1) {
        expect((await ask()).status).toBe(200);
      }
      const refused = await ask();
      expect(refused.status).toBe(429);
      expect(await refused.json()).toMatchObject({ code: "daily_limit_reached" });
      // 10:00 UTC: 14 hours to midnight.
      expect(refused.headers.get("retry-after")).toBe(String(14 * 60 * 60));
    });

    it("counts every signed-in request, including ones that answer 404", async () => {
      const { ask } = await setup(2, new MemoryRequestCountStore());
      expect((await ask("/api/nothing")).status).toBe(404);
      expect((await ask("/api/hello")).status).toBe(200);
      expect((await ask("/api/session")).status).toBe(429);
    });

    it("doesn't count requests without a session, so a signed-in one still gets through", async () => {
      const { ask, askAnonymously } = await setup(1, new MemoryRequestCountStore());
      for (const path of ["/api/hello", "/api/nothing", "/api/session", "/api/hello"]) {
        expect((await askAnonymously(path)).status).not.toBe(429);
      }
      expect((await ask()).status).toBe(200);
      expect((await ask()).status).toBe(429);
    });

    it("starts the count again at the UTC day boundary", async () => {
      const { ask, clock } = await setup(1, new MemoryRequestCountStore());
      expect((await ask()).status).toBe(200);
      expect((await ask()).status).toBe(429);
      clock.advance(14 * 60 * 60 * 1000);
      expect((await ask()).status).toBe(200);
    });

    it("rounds Retry-After up to whole seconds just before midnight", async () => {
      const { ask, clock } = await setup(1, new MemoryRequestCountStore());
      clock.advance(14 * 60 * 60 * 1000 - 29_500);
      await ask();
      expect((await ask()).headers.get("retry-after")).toBe("30");
    });

    it("doesn't count a request the Host check refused", async () => {
      const counts = new MemoryRequestCountStore();
      const { ask } = await setup(1, counts);
      expect((await ask("/api/session", "evil.example")).status).toBe(421);
      expect((await ask()).status).toBe(200);
    });

    it("neither counts nor touches the store when there is no ceiling", async () => {
      const { ask } = await setup(undefined, {
        countRequest: async () => {
          throw new Error("the store must not be used");
        },
      });
      expect((await ask()).status).toBe(200);
    });
  });
});
