import { RecentWorkspaces } from "@halonicjs/studio-feature-workspace";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
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

  it("remembers that the finished card was shown, per folder, and survives a full storage", () => {
    const pages = storage();
    const recent = new RecentWorkspaces(pages);
    const sample = sampleWorkspaceOf("/docs/Acme sample", recent, pages);
    expect(sample.finishedShown()).toBe(false);
    sample.recordFinishedShown();
    expect(sampleWorkspaceOf("/docs/Acme sample", recent, pages).finishedShown()).toBe(true);
    expect(sampleWorkspaceOf("/docs/Acme sample 2", recent, pages).finishedShown()).toBe(false);

    const full = sampleWorkspaceOf("/docs/Acme sample", recent, storage(true));
    expect(() => full.recordFinishedShown()).not.toThrow();
  });

  it("opens the New workspace dialog only when the app has one", () => {
    const pages = storage();
    const recent = new RecentWorkspaces(pages);
    expect(sampleWorkspaceOf("/docs/Acme", recent, pages).startOwnWorkspace).toBeUndefined();
    let opened = 0;
    const sample = sampleWorkspaceOf("/docs/Acme", recent, pages, () => opened++);
    sample.startOwnWorkspace?.();
    expect(opened).toBe(1);
  });
});

verifies("first-run.own-card", () => {
  it("remembers Get set up per folder, reads anything else as unseen, and survives a full storage", () => {
    const pages = storage();
    const recent = new RecentWorkspaces(pages);
    const acme = sampleWorkspaceOf("/docs/acme", recent, pages);
    expect(acme.ownCardMemory()).toBe("unseen");

    acme.recordOwnCard("showing");
    expect(sampleWorkspaceOf("/docs/acme", recent, pages).ownCardMemory()).toBe("showing");
    expect(sampleWorkspaceOf("/docs/acme 2", recent, pages).ownCardMemory()).toBe("unseen");

    pages.setItem("halonic.first-run.own-card./docs/acme", "shown");
    expect(acme.ownCardMemory()).toBe("unseen");
    expect(() =>
      sampleWorkspaceOf("/docs/acme", recent, storage(true)).recordOwnCard("finished"),
    ).not.toThrow();
  });
});

verifies("first-run.one-state", () => {
  it("tells the first run once when Recent starts remembering the open folder as the demo", () => {
    const pages = storage();
    const recent = new RecentWorkspaces(pages);
    recent.remember({ location: "/docs/Acme sample", name: "Acme" });
    const marked = vi.fn();
    sampleWorkspaceOf("/docs/Acme sample", recent, pages).onMarkedSample?.(marked);

    recent.remember({ location: "/docs/Acme notes", name: "Notes" });
    expect(marked).not.toHaveBeenCalled();
    recent.markSample("/docs/Acme sample");
    recent.remember({ location: "/docs/Acme sample", name: "Acme" });
    expect(marked).toHaveBeenCalledOnce();
  });

  it("stops telling once the first run stops watching", () => {
    const pages = storage();
    const recent = new RecentWorkspaces(pages);
    recent.remember({ location: "/docs/Acme sample", name: "Acme" });
    const marked = vi.fn();
    const stop = sampleWorkspaceOf("/docs/Acme sample", recent, pages).onMarkedSample?.(marked);

    stop?.();
    recent.markSample("/docs/Acme sample");

    expect(marked).not.toHaveBeenCalled();
  });
});
