import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { liveVersionOf } from "./live-version.ts";
import { routineVersions } from "./routine-versions.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { TestVersions } from "./testing/test-versions.ts";

const morningPath = "workflows/routines/morning.routine.yaml";

/** Acme's routine "morning", which starts workflow `digest` on `schedule`. */
function morning(schedule = "0 8 * * *", enabled = true): string {
  return [
    "id: morning",
    "name: Morning",
    `enabled: ${enabled}`,
    `trigger: { schedule: "${schedule}" }`,
    "run: { workflow: digest }",
    "",
  ].join("\n");
}

/** `routineVersions` of "morning", with these saved files and the versions as they are. */
async function versionsOf(versions: TestVersions | null, saved: Record<string, string>) {
  const live = await liveVersionOf(versions);
  const vcs = versions ?? new TestVersions();
  return routineVersions({ live, vcs, saved: new TestDefinitionStore(saved) }, morningPath);
}

/** A routine's schedule, or `null` for none. */
function scheduleOf(routine: { trigger: object } | null): string | null {
  return routine !== null && "schedule" in routine.trigger
    ? String(routine.trigger.schedule)
    : null;
}

verifies("app.routine-versions", () => {
  it("gives the live and the saved routine apart when a saved change isn't live", async () => {
    const versions = new TestVersions();
    versions.commit({ [morningPath]: morning() }, "2026-11-11T10:42:00Z");

    const result = await versionsOf(versions, { [morningPath]: morning("0 7 * * *") });

    expect(scheduleOf(result.live)).toBe("0 8 * * *");
    expect(scheduleOf(result.saved)).toBe("0 7 * * *");
    expect(result.savedProblems).toEqual([]);
    expect(result.liveState).toEqual({ state: "not-live", since: "2026-11-11T10:42:00Z" });
  });

  it("names the problems of a saved file that doesn't parse, and keeps the live routine", async () => {
    const versions = new TestVersions();
    versions.commit({ [morningPath]: morning() }, "2026-11-11T10:42:00Z");

    const result = await versionsOf(versions, {
      [morningPath]: morning().replace("run: { workflow: digest }\n", ""),
    });

    expect(scheduleOf(result.live)).toBe("0 8 * * *");
    expect(result.saved).toBeNull();
    expect(result.savedProblems.length).toBeGreaterThan(0);
    expect(result.liveState).toEqual({ state: "not-live", since: "2026-11-11T10:42:00Z" });
  });

  it("has no live routine for one never in a version", async () => {
    const versions = new TestVersions();
    expect(await versionsOf(versions, { [morningPath]: morning() })).toMatchObject({
      live: null,
      liveState: { state: "never-versioned" },
    });

    versions.commit({ "workspace.yaml": "id: acme\nname: Acme\n" });
    expect(await versionsOf(versions, { [morningPath]: morning() })).toMatchObject({
      live: null,
      liveState: { state: "never-versioned" },
    });
  });

  it("is live when only enabled differs, and gives each side its own enabled", async () => {
    const versions = new TestVersions();
    versions.commit({ [morningPath]: morning() });

    const result = await versionsOf(versions, { [morningPath]: morning("0 8 * * *", false) });

    expect([result.live?.enabled, result.saved?.enabled]).toEqual([true, false]);
    expect(result.liveState).toEqual({ state: "live" });
  });

  it("gives the saved routine as the live one with history off", async () => {
    const result = await versionsOf(null, { [morningPath]: morning("0 9 * * *") });

    expect(scheduleOf(result.live)).toBe("0 9 * * *");
    expect(result.live).toEqual(result.saved);
    expect(result.liveState).toEqual({ state: "live" });
  });

  it("has no saved routine when its saved file is gone", async () => {
    const versions = new TestVersions();
    versions.commit({ [morningPath]: morning() }, "2026-11-11T10:42:00Z");

    const result = await versionsOf(versions, {});

    expect(scheduleOf(result.live)).toBe("0 8 * * *");
    expect([result.saved, result.savedProblems]).toEqual([null, []]);
    expect(result.liveState).toEqual({ state: "not-live", since: "2026-11-11T10:42:00Z" });
  });
});
