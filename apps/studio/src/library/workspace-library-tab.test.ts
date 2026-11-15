import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { WorkspaceLibraryTab } from "./workspace-library-tab.ts";

function storage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

verifies("library.library-place", () => {
  it("keeps the tab for each workspace, and reads it again in a new window", () => {
    const shared = storage();
    new WorkspaceLibraryTab(shared, "/work/acme").set("collection");
    expect(new WorkspaceLibraryTab(shared, "/work/acme").get()).toBe("collection");
    expect(new WorkspaceLibraryTab(shared, "/work/beta").get()).toBeUndefined();
  });

  it("ignores a stored word that is no tab", () => {
    const shared = storage();
    shared.setItem("halonic.library-tab:/work/acme", "plugins");
    expect(new WorkspaceLibraryTab(shared, "/work/acme").get()).toBeUndefined();
  });

  it("keeps the tab for the session when storage refuses", () => {
    const refusing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    const tab = new WorkspaceLibraryTab(refusing, "/work/acme");
    expect(tab.get()).toBeUndefined();
    tab.set("knowledge");
    expect(tab.get()).toBe("knowledge");
  });
});
