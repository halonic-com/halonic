import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { setup, weekly } from "./workspace-routines.test-helper.ts";

verifies("studio.workspace-routines", () => {
  it("deletes a routine into the trash as one change", async () => {
    const { host, store, changes } = setup();
    await host.trash(weekly);
    expect(store["hubs/acme/workflows/routines/weekly-report.routine.yaml"]).toBeUndefined();
    expect(changes).toEqual([
      {
        label: "Deleted routine Weekly report",
        changes: { "hubs/acme/workflows/routines/weekly-report.routine.yaml": null },
      },
    ]);
  });

  it("puts a deleted routine back with Undo, right after and after another change", async () => {
    const { host, store, changes } = setup();
    const path = "hubs/acme/workflows/routines/weekly-report.routine.yaml";
    const before = store[path];

    await (await host.trash(weekly)).undo();
    expect(store[path]).toBe(before);

    const trashed = await host.trash(weekly);
    await host.create({ name: "Morning check", hubId: "acme" });
    await trashed.undo();
    expect(store[path]).toBe(before);
    expect(store["hubs/acme/workflows/routines/morning-check.routine.yaml"]).toBeDefined();
    expect(changes.at(-1)).toEqual({
      label: "Put back routine Weekly report",
      changes: { [path]: before },
    });
  });

  it("refuses Undo, writing nothing, when a new routine has taken the deleted one's file", async () => {
    const { host, store } = setup();
    const path = "hubs/acme/workflows/routines/weekly-report.routine.yaml";

    const trashed = await host.trash(weekly);
    await host.create({ name: "Weekly report", hubId: "acme" });
    const made = store[path];

    await expect(trashed.undo()).rejects.toMatchObject({
      kind: "conflict",
      message: `Weekly report can't be put back, because there is a new ${path}. Rename or move it, then undo again.`,
    });
    expect(store[path]).toBe(made);
  });
});
