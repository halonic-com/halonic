import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import {
  type LiveResource,
  type LiveSweeper,
  liveResourceName,
  parseLiveResourceName,
  sweep,
} from "../lib/live-resources.ts";
import { liveSweepers, sweepSummary } from "./live-sweep.ts";

const now = new Date("2026-11-12T12:00:00Z");
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);

/** A sweeper over a fixed list; `destroy` records the names, or throws for `broken`. */
function fakeSweeper(resources: LiveResource[], broken: string[] = []) {
  const destroyed: string[] = [];
  const sweeper: LiveSweeper = {
    target: "cloudflare",
    list: async () => resources,
    destroy: async (resource) => {
      if (broken.includes(resource.name)) {
        throw new Error("403 from the provider");
      }
      destroyed.push(resource.name);
    },
  };
  return { sweeper, destroyed };
}

verifies("check.live-sweep", () => {
  describe("names", () => {
    test("builds and reads hlt-<run>-<attempt>-<what>", () => {
      const name = liveResourceName("123", "1", "worker-blobs");
      expect(name).toBe("hlt-123-1-worker-blobs");
      expect(parseLiveResourceName(name)).toEqual({
        run: "123",
        attempt: "1",
        what: "worker-blobs",
      });
    });

    test.each(["acme-halonic", "hlt-abc-1-worker", "hlt-1-1-Worker", `hlt-1-1-${"x".repeat(60)}`])(
      "refuses %s",
      (name) => {
        expect(parseLiveResourceName(name)).toBeUndefined();
      },
    );

    test("throws for parts that don't make a name", () => {
      expect(() => liveResourceName("run", "1", "worker")).toThrow(/not a live test resource/);
    });
  });

  describe("sweep", () => {
    test("deletes only hlt- resources older than 2 hours", async () => {
      const { sweeper, destroyed } = fakeSweeper([
        { kind: "worker", name: "hlt-123-1-worker", createdAt: hoursAgo(3) },
        { kind: "worker", name: "hlt-124-1-worker", createdAt: hoursAgo(1) },
        { kind: "worker", name: "acme-halonic", createdAt: hoursAgo(9000) },
      ]);
      const report = await sweep([sweeper], now);
      expect(destroyed).toEqual(["hlt-123-1-worker"]);
      expect(report.deleted.map((resource) => resource.name)).toEqual(["hlt-123-1-worker"]);
    });

    test("reports a failed delete and goes on", async () => {
      const { sweeper, destroyed } = fakeSweeper(
        [
          { kind: "d1", name: "hlt-1-1-data", createdAt: hoursAgo(5) },
          { kind: "r2", name: "hlt-1-1-blobs", createdAt: hoursAgo(5) },
        ],
        ["hlt-1-1-data"],
      );
      const report = await sweep([sweeper], now);
      expect(destroyed).toEqual(["hlt-1-1-blobs"]);
      expect(report.failed).toEqual([
        {
          resource: expect.objectContaining({ name: "hlt-1-1-data" }),
          error: "403 from the provider",
        },
      ]);
    });
  });

  describe("sweepSummary", () => {
    const leftover: LiveResource = {
      kind: "worker",
      name: "hlt-1-1-worker",
      createdAt: hoursAgo(3),
    };

    test("passes with nothing to sweep while no target has a sweeper", () => {
      expect(liveSweepers).toEqual([]);
      expect(sweepSummary({ deleted: [], failed: [] }, 0, true)).toEqual({
        lines: ["live-sweep: no target has a sweeper yet; nothing to sweep."],
        failed: false,
      });
    });

    test("fails the nightly run when it had to delete anything", () => {
      const summary = sweepSummary({ deleted: [leftover], failed: [] }, 1, true);
      expect(summary.failed).toBe(true);
      expect(summary.lines.at(-1)).toMatch(/leaks/);
    });

    test("only reports a delete outside the nightly run", () => {
      expect(sweepSummary({ deleted: [leftover], failed: [] }, 1, false).failed).toBe(false);
    });

    test("always fails when a delete failed", () => {
      const summary = sweepSummary(
        { deleted: [], failed: [{ resource: leftover, error: "x" }] },
        1,
        false,
      );
      expect(summary.failed).toBe(true);
    });
  });
});
