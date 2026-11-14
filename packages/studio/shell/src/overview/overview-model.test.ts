import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { allFilter, type OverviewHub, overviewSections, sharedFilter } from "./overview-model.ts";

const hubs: readonly OverviewHub[] = [
  {
    id: "acme",
    name: "acme",
    items: [
      { id: "draft-reply", name: "Draft reply" },
      { id: "summarise", name: "Summarise", pinned: true, description: "Shortens long mail" },
    ],
  },
  { id: "beta", name: "beta", items: [{ id: "billing", name: "Billing", detail: "Monthly" }] },
  { id: "empty", name: "empty", items: [] },
];
const shared = { workspaceName: "Acme", items: [{ id: "tone", name: "Tone" }] };

function shape(query: string, filter = allFilter) {
  return overviewSections(hubs, shared, { filter, query }).map((section) => ({
    id: section.id,
    items: section.items.map((item) => item.id),
  }));
}

verifies("shell.overview.hub-sections-and-pins", () => {
  it("shows every hub, even an empty one, then the shared section, pinned items first", () => {
    expect(shape("")).toEqual([
      { id: "acme", items: ["summarise", "draft-reply"] },
      { id: "beta", items: ["billing"] },
      { id: "empty", items: [] },
      { id: sharedFilter, items: ["tone"] },
    ]);
  });

  it("names the shared section after the workspace", () => {
    const names = overviewSections(hubs, shared, { filter: allFilter, query: "" }).map(
      (section) => section.name,
    );
    expect(names.at(-1)).toBe("Shared in Acme");
  });

  it("leaves the shared section out when nothing is shared", () => {
    const sections = overviewSections(
      hubs,
      { workspaceName: "Acme", items: [] },
      {
        filter: allFilter,
        query: "",
      },
    );
    expect(sections.map((section) => section.id)).toEqual(["acme", "beta", "empty"]);
  });

  it("shows only the picked hub, or only the shared items", () => {
    expect(shape("", "beta")).toEqual([{ id: "beta", items: ["billing"] }]);
    expect(shape("", sharedFilter)).toEqual([{ id: sharedFilter, items: ["tone"] }]);
  });
});

verifies("shell.overview.search", () => {
  it("matches the name, id, description and detail, ignoring case", () => {
    expect(shape("DRAFT")).toEqual([{ id: "acme", items: ["draft-reply"] }]);
    expect(shape("long mail")).toEqual([{ id: "acme", items: ["summarise"] }]);
    expect(shape("monthly")).toEqual([{ id: "beta", items: ["billing"] }]);
    expect(shape("tone")).toEqual([{ id: sharedFilter, items: ["tone"] }]);
  });

  it("hides the sections without a match", () => {
    expect(shape("billing").map((section) => section.id)).toEqual(["beta"]);
  });

  it("shows everything again for a blank search", () => {
    expect(shape("  ")).toEqual(shape(""));
  });
});
