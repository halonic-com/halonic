import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { lastTickKey, routineRunId, shortHash, utf8Length } from "./routine-ids.ts";

const at = new Date("2026-11-03T08:00:00Z");

verifies("app.routine-scheduler", () => {
  it("gives the same id for the same workspace, routine and time, and a new one otherwise", () => {
    const id = routineRunId("memory:a", "p/daily", at);
    expect(id).toBe(`routine:${shortHash("memory:a")}/p/daily@2026-11-03T08:00:00.000Z`);
    expect(routineRunId("memory:a", "p/daily", at)).toBe(id);
    expect(routineRunId("memory:b", "p/daily", at)).not.toBe(id);
    expect(routineRunId("memory:a", "p/daily", new Date("2026-11-04T08:00:00Z"))).not.toBe(id);
  });

  it("hashes a routine key that would make the id longer than 256 bytes", () => {
    const longKey = `${"h".repeat(200)}/${"é".repeat(40)}`;
    const id = routineRunId("memory:a", longKey, at);
    expect(utf8Length(id)).toBeLessThanOrEqual(256);
    expect(id).toBe(
      `routine:${shortHash("memory:a")}/#${shortHash(longKey)}@2026-11-03T08:00:00.000Z`,
    );
    expect(routineRunId("memory:a", `${longKey}x`, at)).not.toBe(id);
  });

  it("keeps one last-tick key per workspace, short however long the id", () => {
    expect(lastTickKey("memory:a")).not.toBe(lastTickKey("memory:b"));
    expect(utf8Length(lastTickKey("w".repeat(500)))).toBeLessThanOrEqual(256);
  });

  it("keeps the run ids and last-tick key it gave before, so stored runs still match", () => {
    // Written down from the first release. If one of these changes, a host
    // would start a run again that already ran.
    expect(routineRunId("ws-7f3a2c", "acme/daily-report", at)).toBe(
      "routine:9f67cab0a2a7258c/acme/daily-report@2026-11-03T08:00:00.000Z",
    );
    expect(routineRunId("ws-7f3a2c", "acme/résumé-😀", at)).toBe(
      "routine:9f67cab0a2a7258c/acme/résumé-😀@2026-11-03T08:00:00.000Z",
    );
    expect(routineRunId("ws-7f3a2c", `${"h".repeat(200)}/${"é".repeat(40)}`, at)).toBe(
      "routine:9f67cab0a2a7258c/#71c5fc5ab9aa743e@2026-11-03T08:00:00.000Z",
    );
    expect(routineRunId("ws-\ud800", "acme/daily-report", at)).toBe(
      "routine:91f0ef6d848d1503/acme/daily-report@2026-11-03T08:00:00.000Z",
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
