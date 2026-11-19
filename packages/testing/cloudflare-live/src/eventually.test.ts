import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { eventually } from "./eventually.ts";
import { UnexpectedStatus, type WorkerTarget, workerChecks } from "./transfer-checks.ts";

const key = "Kq3-this-key-was-made-up-for-the-test";

/** The Worker before the key was set: every `/admin` path is the closed 404. */
const olderVersion = async () => Response.json({ code: "not_found" }, { status: 404 });

/** The Worker with the key set: any `/admin` call without the right Bearer key is a 401. */
function newVersion(options: { keyInUrl?: boolean } = {}): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const given =
      headers.get("authorization") === `Bearer ${key}` ||
      (options.keyInUrl === true && url.searchParams.get("key") === key);
    if (given && !headers.has("origin")) return Response.json({});
    return Response.json({ code: "unauthorized" }, { status: 401 });
  };
}

/** A Worker address that answers each request from the version `versionOf` names for it, counting from 1. */
function rollingOut(versionOf: (request: number) => "older" | "new", latest = newVersion()) {
  let requests = 0;
  const target: WorkerTarget = {
    baseUrl: "https://hlt-1-1.example.workers.dev",
    fetch: async (input, init) =>
      versionOf(++requests) === "older" ? olderVersion() : latest(input, init),
  };
  return { target, requests: () => requests };
}

/** The live suite's wait for the key: the full sweep, retrying only the older version's 404. */
function sweep(target: WorkerTarget): () => Promise<void> {
  return async () => {
    await workerChecks.adminKeyActive(target);
    await workerChecks.adminRefusesBadKeys(target, key);
  };
}
const olderVersionAnswered = (error: unknown) =>
  error instanceof UnexpectedStatus && error.status === 404;

// One sweep is the key check plus 4 routes times 7 requests.
const perSweep = 29;

verifies("cloudflare-live.transfer", () => {
  describe("waiting for a new Worker version", () => {
    it("doesn't take one pass for the new version when the next request reaches the older one", async () => {
      // As on CI: the key check reaches the new version, the sweep's next request the older one.
      const { target } = rollingOut((request) => (request === 2 ? "older" : "new"));
      await expect(
        eventually(() => workerChecks.adminKeyActive(target), {
          passesInARow: 1,
          sleep: async () => {},
        }).then(() => workerChecks.adminRefusesBadKeys(target, key)),
      ).rejects.toThrow(/answered 404 not_found, expected 401/);

      const again = rollingOut((request) => (request === 2 ? "older" : "new"));
      const waits: number[] = [];
      await eventually(sweep(again.target), {
        retryIf: olderVersionAnswered,
        sleep: async (ms) => void waits.push(ms),
      });
      // The first sweep failed at its second request, then three full sweeps passed in a row.
      expect(again.requests()).toBe(2 + 3 * perSweep);
      expect(waits).toEqual([5_000, 5_000, 5_000]);
    });

    it("starts the count again when the older version answers between passes", async () => {
      // Sweeps 1 and 2 pass, sweep 3 reaches the older version on its first request, 4 to 6 pass.
      const { target, requests } = rollingOut((request) =>
        request === 2 * perSweep + 1 ? "older" : "new",
      );
      await eventually(sweep(target), { retryIf: olderVersionAnswered, sleep: async () => {} });
      expect(requests()).toBe(5 * perSweep + 1);
    });

    it("fails with the older version's 404 when every other request reaches it", async () => {
      const { target } = rollingOut((request) => (request % 2 === 0 ? "older" : "new"));
      let waited = 0;
      await expect(
        eventually(sweep(target), {
          retryIf: olderVersionAnswered,
          sleep: async () => void waited++,
        }),
      ).rejects.toThrow(/answered 404 not_found, expected 401/);
      expect(waited).toBe(11);
    });

    it("fails at once, without retrying, when the new version takes a bad key", async () => {
      const { target } = rollingOut(() => "new", newVersion({ keyInUrl: true }));
      let waited = 0;
      await expect(
        eventually(sweep(target), {
          retryIf: olderVersionAnswered,
          sleep: async () => void waited++,
        }),
      ).rejects.toThrow(/with the key in the URL was answered 200, expected 401/);
      expect(waited).toBe(0);
    });

    it("retries every failure when no filter is given, and needs the passes in a row", async () => {
      const outcomes = [true, false, true, true, false, true];
      let tries = 0;
      await expect(
        eventually(
          async () => {
            const passes = outcomes[tries++] ?? false;
            if (!passes) throw new Error(`try ${tries} failed`);
          },
          { attempts: outcomes.length, sleep: async () => {} },
        ),
      ).rejects.toThrow("try 5 failed");
      expect(tries).toBe(6);
    });
  });
});
