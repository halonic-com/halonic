import { RecentWorkspaces } from "@halonicjs/studio-feature-workspace";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { sampleWorkspaceOf } from "./sample-workspace.ts";

/** A page storage that keeps text, and fails to write when `full` is set. */
function storage(full = false) {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (full) throw new Error("quota");
      items.set(key, value);
    },
  };
}

verifies("studio.try-sample", () => {
  it("knows a folder is the sample when Recent remembers it as one", () => {
    const pages = storage();
    const recent = new RecentWorkspaces(pages);
    recent.remember({ location: "/docs/Acme sample", name: "Acme" });
    const sample = sampleWorkspaceOf("/docs/Acme sample", recent, pages);
    expect(sample.isSample()).toBe(false);

    recent.markSample("/docs/Acme sample");
    expect(sample.isSample()).toBe(true);
  });

  it("keeps the steps done in each folder on the device, in the card's order", () => {
    const pages = storage();
    const recent = new RecentWorkspaces(pages);
    const sample = sampleWorkspaceOf("/docs/Acme sample", recent, pages);
    sample.recordDone("see");
    sample.recordDone("start");
    sample.recordDone("start");

    expect(sample.doneSteps()).toEqual(["start", "see"]);
    expect(sampleWorkspaceOf("/docs/Acme sample", recent, pages).doneSteps()).toEqual([
      "start",
      "see",
    ]);
    expect(sampleWorkspaceOf("/docs/Acme sample 2", recent, pages).doneSteps()).toEqual([]);
  });

  it("counts saved text that isn't a list of steps as none, and survives a full storage", () => {
    const pages = storage();
    pages.setItem("halonic.first-run.steps./docs/Acme sample", "not json");
    const recent = new RecentWorkspaces(pages);
    expect(sampleWorkspaceOf("/docs/Acme sample", recent, pages).doneSteps()).toEqual([]);
    pages.setItem("halonic.first-run.steps./docs/Acme sample", '{"a":1}');
    expect(sampleWorkspaceOf("/docs/Acme sample", recent, pages).doneSteps()).toEqual([]);

    const full = storage(true);
    const sample = sampleWorkspaceOf("/docs/Acme sample", recent, full);
    expect(() => sample.recordDone("start")).not.toThrow();
  });
});
