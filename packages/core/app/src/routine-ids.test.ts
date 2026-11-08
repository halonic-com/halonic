import { describe, expect, it } from "vitest";
import { lastTickKey, routineRunId, shortHash, utf8Length } from "./routine-ids.ts";

const at = new Date("2026-11-03T08:00:00Z");

describe("app.routine-scheduler: run ids and keys", () => {
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
    expect(utf8Length(lastTickKey(`/home/${"x".repeat(500)}`))).toBeLessThanOrEqual(256);
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
