import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { computerName } from "./computer-name.ts";
import { ServerReach } from "./server-reach.ts";

const request = new Request("https://halonic.acme.test/api/messaging/sources");

/** A reach whose clock reads `times` in turn, and a way to send one answer or failure through it. */
function reachWith(...times: string[]) {
  const reach = new ServerReach(() => new Date(times.shift() ?? "2026-11-26T15:00:00.000Z"));
  const send = (answer: () => Promise<Response>) =>
    reach
      .watch(answer)(request)
      .catch(() => undefined);
  return { reach, send };
}

verifies("agent-host.server-engine-pairing", () => {
  describe("ServerReach", () => {
    it("knows nothing before the first call ends", () => {
      expect(new ServerReach().last).toBeUndefined();
    });

    it("is offline for a dead network, a timeout, an abort or a 5xx, and online for a 2xx", async () => {
      const failures: (() => Promise<Response>)[] = [
        () => Promise.reject(new TypeError("fetch failed")),
        () => Promise.reject(new DOMException("timed out", "TimeoutError")),
        () => Promise.reject(new DOMException("aborted", "AbortError")),
        () => Promise.resolve(new Response(null, { status: 503 })),
      ];
      for (const failure of failures) {
        const { reach, send } = reachWith("2026-11-26T14:02:00.000Z");
        await send(failure);
        expect(reach.last).toEqual({ state: "offline", asOf: "2026-11-26T14:02:00.000Z" });
      }
      const { reach, send } = reachWith("2026-11-26T14:03:00.000Z");
      await send(() => Promise.resolve(new Response("{}", { status: 200 })));
      expect(reach.last).toEqual({ state: "online", asOf: "2026-11-26T14:03:00.000Z" });
    });

    it("leaves it as it was for a 401, 403, 404 or 429, and passes the answer and the failure on", async () => {
      const { reach, send } = reachWith("2026-11-26T14:02:00.000Z");
      await send(() => Promise.reject(new TypeError("fetch failed")));
      for (const status of [401, 403, 404, 429]) {
        await send(() => Promise.resolve(new Response(null, { status })));
      }
      expect(reach.last).toEqual({ state: "offline", asOf: "2026-11-26T14:02:00.000Z" });
      const answer = new Response(null, { status: 404 });
      expect(await reach.watch(() => Promise.resolve(answer))(request)).toBe(answer);
      const failure = new TypeError("fetch failed");
      await expect(reach.watch(() => Promise.reject(failure))(request)).rejects.toBe(failure);
    });
  });

  describe("computerName", () => {
    it("drops control and format characters, trims, and cuts to 80 characters whole", () => {
      expect(computerName("  acme-mbp\n")).toBe("acme-mbp");
      expect(computerName("acme\u0007\u200Bmbp")).toBe("acmembp");
      const long = `${"a".repeat(79)}😀😀`;
      expect(computerName(long)).toBe(`${"a".repeat(79)}😀`);
      expect(computerName(" \u0000 ")).toBeUndefined();
    });
  });
});
