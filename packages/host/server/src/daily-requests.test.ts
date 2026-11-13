import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { RequestCountStore } from "./api.ts";
import { MemoryRequestCountStore } from "./memory-request-count-store.ts";
import { TestClock, testServer } from "./test-server.ts";

const host = "halonic.acme.example";

function setup(dailyRequests: number | undefined, requestCounts: RequestCountStore) {
  const clock = new TestClock();
  const server = testServer({
    passwordHash: "hash",
    clock,
    requestCounts,
    config: { allowedHosts: [host], ...(dailyRequests === undefined ? {} : { dailyRequests }) },
  });
  const ask = (path = "/api/hello", requestHost = host) =>
    server.handle(new Request(`https://${requestHost}${path}`, { headers: { host: requestHost } }));
  return { clock, ask };
}

describe("daily requests", () => {
  verifies("server.daily-requests", () => {
    it("answers 429 with a Retry-After to the request after the ceiling", async () => {
      const { ask } = setup(3, new MemoryRequestCountStore());
      for (let call = 0; call < 3; call += 1) {
        expect((await ask()).status).toBe(200);
      }
      const refused = await ask();
      expect(refused.status).toBe(429);
      expect(await refused.json()).toMatchObject({ code: "daily_limit_reached" });
      // 10:00 UTC: 14 hours to midnight.
      expect(refused.headers.get("retry-after")).toBe(String(14 * 60 * 60));
    });

    it("counts every route, including ones that answer 404", async () => {
      const { ask } = setup(2, new MemoryRequestCountStore());
      expect((await ask("/api/nothing")).status).toBe(404);
      expect((await ask("/api/session")).status).toBe(401);
      expect((await ask("/api/hello")).status).toBe(429);
    });

    it("starts the count again at the UTC day boundary", async () => {
      const { ask, clock } = setup(1, new MemoryRequestCountStore());
      expect((await ask()).status).toBe(200);
      expect((await ask()).status).toBe(429);
      clock.advance(14 * 60 * 60 * 1000);
      expect((await ask()).status).toBe(200);
    });

    it("rounds Retry-After up to whole seconds just before midnight", async () => {
      const { ask, clock } = setup(1, new MemoryRequestCountStore());
      clock.advance(14 * 60 * 60 * 1000 - 29_500);
      await ask();
      expect((await ask()).headers.get("retry-after")).toBe("30");
    });

    it("doesn't count a request the Host check refused", async () => {
      const counts = new MemoryRequestCountStore();
      const { ask } = setup(1, counts);
      expect((await ask("/api/hello", "evil.example")).status).toBe(421);
      expect((await ask()).status).toBe(200);
    });

    it("neither counts nor touches the store when there is no ceiling", async () => {
      const { ask } = setup(undefined, {
        countRequest: async () => {
          throw new Error("the store must not be used");
        },
      });
      expect((await ask()).status).toBe(200);
    });
  });
});
