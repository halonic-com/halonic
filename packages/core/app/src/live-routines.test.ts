import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { LiveRoutines } from "./live-routines.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { TestVersions } from "./testing/test-versions.ts";

const morningPath = "workflows/routines/morning.routine.yaml";
const eveningPath = "workflows/routines/evening.routine.yaml";

/** Acme's routine `id`, which starts workflow `digest` on `schedule`. */
function routine(id: string, options: { schedule?: string; enabled?: boolean } = {}): string {
  const { schedule = "0 8 * * *", enabled = true } = options;
  return [
    `id: ${id}`,
    `name: ${id}`,
    `enabled: ${enabled}`,
    `trigger: { schedule: "${schedule}" }`,
    "run: { workflow: digest }",
    "",
  ].join("\n");
}

/** What the scheduler would get: each routine's id, schedule and `enabled`. */
async function listed(routines: LiveRoutines) {
  return (await routines.list()).map(({ routine }) => ({
    id: routine.id,
    schedule: "schedule" in routine.trigger ? routine.trigger.schedule : null,
    enabled: routine.enabled,
  }));
}

/** Acme's workspace: its versions, its saved files, and the scheduler's list over both. */
function acme(saved: Record<string, string>) {
  const versions = new TestVersions();
  const store = new TestDefinitionStore(saved);
  return { versions, store, routines: new LiveRoutines({ vcs: versions, saved: store }) };
}

verifies("app.scheduler-live-routines", () => {
  it("schedules a routine as its live version has it, not as saved", async () => {
    const { versions, routines } = acme({
      [morningPath]: routine("morning", { schedule: "0 9 * * *" }),
    });
    versions.commit({ [morningPath]: routine("morning") });

    expect(await listed(routines)).toEqual([
      { id: "morning", schedule: "0 8 * * *", enabled: true },
    ]);
  });

  it("takes enabled from the saved file, both off and on", async () => {
    const off = acme({ [morningPath]: routine("morning", { enabled: false }) });
    off.versions.commit({ [morningPath]: routine("morning") });
    expect(await listed(off.routines)).toEqual([
      { id: "morning", schedule: "0 8 * * *", enabled: false },
    ]);

    const on = acme({ [morningPath]: routine("morning", { schedule: "0 9 * * *" }) });
    on.versions.commit({ [morningPath]: routine("morning", { enabled: false }) });
    expect(await listed(on.routines)).toEqual([
      { id: "morning", schedule: "0 8 * * *", enabled: true },
    ]);
  });

  it("doesn't schedule a live routine whose saved file isn't there", async () => {
    const { versions, routines } = acme({});
    versions.commit({ [morningPath]: routine("morning") });

    expect(await listed(routines)).toEqual([]);
  });

  it("reads everything from the saved files with history off", async () => {
    const saved = { [morningPath]: routine("morning", { schedule: "0 9 * * *" }) };
    const expected = [{ id: "morning", schedule: "0 9 * * *", enabled: true }];

    expect(
      await listed(new LiveRoutines({ vcs: null, saved: new TestDefinitionStore(saved) })),
    ).toEqual(expected);
    const { versions, routines } = acme(saved);
    versions.isRepo = false;
    expect(await listed(routines)).toEqual(expected);
  });
});

verifies("app.scheduler-never-live-not-scheduled", () => {
  it("doesn't schedule a routine that has never been in a version, nor fall back to its saved file", async () => {
    const { versions, routines } = acme({
      [morningPath]: routine("morning"),
      [eveningPath]: routine("evening", { schedule: "0 18 * * *" }),
    });
    expect(await listed(routines)).toEqual([]);

    versions.commit({ [morningPath]: routine("morning") });
    expect(await listed(routines)).toEqual([
      { id: "morning", schedule: "0 8 * * *", enabled: true },
    ]);
  });
});

verifies("app.scheduler-keeps-last-enabled-when-unreadable", () => {
  it("keeps the last enabled read while the saved file doesn't parse", async () => {
    const { versions, store, routines } = acme({ [morningPath]: routine("morning") });
    versions.commit({ [morningPath]: routine("morning") });
    expect(await listed(routines)).toMatchObject([{ enabled: true }]);

    await store.write(morningPath, routine("morning", { enabled: false }));
    expect(await listed(routines)).toMatchObject([{ enabled: false }]);

    await store.write(morningPath, "id: morning\nenabled: tru");
    expect(await listed(routines)).toMatchObject([{ enabled: false }]);

    await store.write(morningPath, routine("morning"));
    expect(await listed(routines)).toMatchObject([{ enabled: true }]);
  });

  it("takes the live version's value when no saved value was read yet", async () => {
    const { versions, routines } = acme({ [morningPath]: "id: morning\nenabled: [" });
    versions.commit({ [morningPath]: routine("morning", { enabled: false }) });

    expect(await listed(routines)).toMatchObject([{ enabled: false }]);
  });
});

verifies("app.scheduler-rebuild-on-version-and-watch", () => {
  it("reads a new version and a saved change by the next call", async () => {
    const { versions, store, routines } = acme({ [morningPath]: routine("morning") });
    versions.commit({ [morningPath]: routine("morning") });
    expect(await listed(routines)).toMatchObject([{ schedule: "0 8 * * *", enabled: true }]);

    await store.write(morningPath, routine("morning", { enabled: false }));
    expect(await listed(routines)).toMatchObject([{ schedule: "0 8 * * *", enabled: false }]);

    await store.write(morningPath, routine("morning", { schedule: "0 7 * * *" }));
    versions.commit({ [morningPath]: routine("morning", { schedule: "0 7 * * *" }) });
    expect(await listed(routines)).toMatchObject([{ schedule: "0 7 * * *", enabled: true }]);
  });

  it("reads the live version's files once per version", async () => {
    const { versions, routines } = acme({ [morningPath]: routine("morning") });
    versions.commit({ [morningPath]: routine("morning") });
    let lists = 0;
    const listAt = versions.listAt.bind(versions);
    versions.listAt = (version, dir) => {
      lists += 1;
      return listAt(version, dir);
    };

    await routines.list();
    const afterFirst = lists;
    await routines.list();

    expect(afterFirst).toBeGreaterThan(0);
    expect(lists).toBe(afterFirst);
  });
});
