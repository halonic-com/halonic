import { checkRunId } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { lastTickKey, routineRunId, shortHash, utf8Length } from "./routine-ids.ts";

const at = new Date("2026-11-03T08:00:00Z");

verifies("app.routine-scheduler", () => {
  it("gives the same id for the same workspace, routine and time, and a new one otherwise", () => {
    const id = routineRunId("memory:a", "p/daily", at);
    expect(id).toBe(
      `routine-${shortHash("memory:a")}-20261103T080000.000Z-${shortHash("p/daily@2026-11-03T08:00:00.000Z")}`,
    );
    expect(routineRunId("memory:a", "p/daily", at)).toBe(id);
    expect(routineRunId("memory:b", "p/daily", at)).not.toBe(id);
    expect(routineRunId("memory:a", "p/daily", new Date("2026-11-04T08:00:00Z"))).not.toBe(id);
  });

  it("gives ids every run store keeps as a file name, however long or odd the routine key", () => {
    const keys = [
      "acme/daily-report",
      "@workspace/backup",
      "acme/résumé-😀",
      `${"h".repeat(200)}/${"é".repeat(40)}`,
    ];
    for (const key of keys) {
      const id = routineRunId("memory:a", key, at);
      expect(() => checkRunId(id)).not.toThrow();
      expect(id).toHaveLength(62);
    }
    const longKey = keys[3] ?? "";
    expect(routineRunId("memory:a", `${longKey}x`, at)).not.toBe(
      routineRunId("memory:a", longKey, at),
    );
  });

  it("ends the ids of a routine's runs differently, so their short ids differ", () => {
    const first = routineRunId("memory:a", "acme/daily-report", at);
    const next = routineRunId("memory:a", "acme/daily-report", new Date("2026-11-04T08:00:00Z"));
    expect(first.slice(-6)).not.toBe(next.slice(-6));
  });

  it("keeps one last-tick key per workspace, short however long the id", () => {
    expect(lastTickKey("memory:a")).not.toBe(lastTickKey("memory:b"));
    expect(utf8Length(lastTickKey("w".repeat(500)))).toBeLessThanOrEqual(256);
  });

  it("keeps the run ids and last-tick key it gave before, so stored runs still match", () => {
    // Written down when the ids became file names (HAL-4844). If one of these
    // changes, a host would start a run again that already ran.
    expect(routineRunId("ws-7f3a2c", "acme/daily-report", at)).toBe(
      "routine-9f67cab0a2a7258c-20261103T080000.000Z-a9686c3d856d20f5",
    );
    expect(routineRunId("ws-7f3a2c", "acme/résumé-😀", at)).toBe(
      "routine-9f67cab0a2a7258c-20261103T080000.000Z-df8fb9387bb60c84",
    );
    expect(routineRunId("ws-7f3a2c", `${"h".repeat(200)}/${"é".repeat(40)}`, at)).toBe(
      "routine-9f67cab0a2a7258c-20261103T080000.000Z-1fe1f169a131850d",
    );
    expect(routineRunId("ws-\ud800", "acme/daily-report", at)).toBe(
      "routine-91f0ef6d848d1503-20261103T080000.000Z-a9686c3d856d20f5",
    );
    expect(lastTickKey("ws-7f3a2c")).toBe("routines/9f67cab0a2a7258c/last-tick");
  });

  it("hashes FNV-1a 64 over UTF-8 bytes and counts bytes as TextEncoder does", () => {
    // Published FNV-1a 64 test vectors.
    expect(shortHash("")).toBe("cbf29ce484222325");
    expect(shortHash("a")).toBe("af63dc4c8601ec8c");
    expect(shortHash("foobar")).toBe("85944171f73967e8");
    for (const text of ["", "abc", "é", "€", "😀", "\ud800"]) {
      expect(utf8Length(text)).toBe(new TextEncoder().encode(text).length);
    }
  });
});
