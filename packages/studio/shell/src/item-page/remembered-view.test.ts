import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { ViewMemory } from "./remembered-view.ts";

verifies("shell.item-page-header", () => {
  it("remembers a view for a tab and the place it shows", () => {
    const views = new ViewMemory();
    views.set("tab-1", "workflow/acme/reply", "runs");
    expect(views.get("tab-1", "workflow/acme/reply")).toBe("runs");
    // The same tab on another item, or another tab on this one, starts afresh.
    expect(views.get("tab-1", "agent/acme/sorter")).toBeUndefined();
    expect(views.get("tab-2", "workflow/acme/reply")).toBeUndefined();
  });

  it("forgets the views of tabs that closed", () => {
    const views = new ViewMemory();
    views.set("tab-1", "workflow/acme/reply", "runs");
    views.set("tab-2", "agent/acme/sorter", "configuration");
    views.keepOnly(["tab-2"]);
    expect(views.get("tab-1", "workflow/acme/reply")).toBeUndefined();
    expect(views.get("tab-2", "agent/acme/sorter")).toBe("configuration");
  });
});
