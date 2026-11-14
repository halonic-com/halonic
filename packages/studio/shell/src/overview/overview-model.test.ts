import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  allFilter,
  hubFilter,
  type OverviewHub,
  overviewSections,
  sharedFilter,
} from "./overview-model.ts";

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
      { id: hubFilter("acme"), items: ["summarise", "draft-reply"] },
      { id: hubFilter("beta"), items: ["billing"] },
      { id: hubFilter("empty"), items: [] },
      { id: sharedFilter, items: ["tone"] },
    ]);
  });

  it("hands the page the workspace's name, not a worded heading", () => {
    const last = overviewSections(hubs, shared, { filter: allFilter, query: "" }).at(-1);
    expect(last).toMatchObject({ name: "Acme", shared: true });
  });

  it('keeps a hub called "all" or "shared" apart from the filters', () => {
    const odd = [
      { id: "all", name: "all", items: [{ id: "a", name: "A" }] },
      { id: "shared", name: "shared", items: [{ id: "b", name: "B" }] },
    ];
    const ids = overviewSections(odd, shared, { filter: allFilter, query: "" }).map((s) => s.id);
    expect(new Set(ids).size).toBe(3);
    const only = overviewSections(odd, shared, { filter: hubFilter("shared"), query: "" });
    expect(only.map((section) => section.items.map((item) => item.id))).toEqual([["b"]]);
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
    expect(sections.map((section) => section.id)).toEqual([
      hubFilter("acme"),
      hubFilter("beta"),
      hubFilter("empty"),
    ]);
  });

  it("shows only the picked hub, or only the shared items", () => {
    expect(shape("", hubFilter("beta"))).toEqual([{ id: hubFilter("beta"), items: ["billing"] }]);
    expect(shape("", sharedFilter)).toEqual([{ id: sharedFilter, items: ["tone"] }]);
  });
});

verifies("shell.overview.search", () => {
  it("matches the name, id, description and detail, ignoring case", () => {
    expect(shape("DRAFT")).toEqual([{ id: hubFilter("acme"), items: ["draft-reply"] }]);
    expect(shape("long mail")).toEqual([{ id: hubFilter("acme"), items: ["summarise"] }]);
    expect(shape("monthly")).toEqual([{ id: hubFilter("beta"), items: ["billing"] }]);
    expect(shape("tone")).toEqual([{ id: sharedFilter, items: ["tone"] }]);
  });

  it("hides the sections without a match", () => {
    expect(shape("billing").map((section) => section.id)).toEqual([hubFilter("beta")]);
  });

  it("shows everything again for a blank search", () => {
    expect(shape("  ")).toEqual(shape(""));
  });
});
