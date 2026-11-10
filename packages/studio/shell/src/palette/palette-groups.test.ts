import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { SearchResult } from "../points/commands.ts";
import type { TabLocation } from "../tabs/tab-set.ts";
import { type PaletteContent, type PaletteSources, paletteGroups } from "./palette-groups.ts";

const home: TabLocation = { key: "home", title: "Home" };
const workflows: TabLocation = { key: "workflows", title: "Workflows" };
const supportReply: TabLocation = {
  key: "workflow/acme/support-reply",
  title: "Support reply",
  kind: "workflow",
};
const refundPolicy: TabLocation = { key: "skill/acme/refund-policy", title: "Refund policy" };

function found(kind: string, id: string, label: string, detail?: string): SearchResult {
  return { item: { kind, hub: "acme", id }, label, ...(detail === undefined ? {} : { detail }) };
}

function palette(sources: Partial<PaletteSources>): PaletteContent {
  return paletteGroups({
    words: "",
    openTabs: [],
    recent: [],
    found: [],
    searchFailed: false,
    actions: [],
    ...sources,
  });
}

/** The palette as a person reads it: each group's title, then its rows. */
function read(content: PaletteContent): string[] {
  return content.groups.flatMap((group) => [
    `${group.title}:`,
    ...group.rows.map((row) =>
      [row.label, row.detail, row.open ? "Switch to tab" : undefined]
        .filter((part) => part !== undefined)
        .join(" · "),
    ),
  ]);
}

verifies("shell.palette-groups", () => {
  it("shows Open tabs, then Recent places no tab shows, while nothing is typed", () => {
    const content = palette({
      words: " ",
      openTabs: [home, supportReply],
      recent: [supportReply, refundPolicy, workflows],
      actions: [{ id: "shell.new-tab", title: "New tab" }],
    });
    expect(read(content)).toEqual([
      "Open tabs:",
      "Home · Switch to tab",
      "Support reply · Switch to tab",
      "Recent:",
      "Refund policy",
      "Workflows",
    ]);
    expect(content.nothingFound).toBe(false);
  });

  it("orders names by how well they match, then by how recently they were opened", () => {
    const content = palette({
      words: "refund",
      recent: [refundPolicy],
      found: [
        found("agent", "late-refunds", "Late refunds", "Agent · acme"),
        found("routine", "prefund", "Prefund check", "Routine · acme"),
        found("agent", "refund-checker", "Refund checker", "Agent · acme"),
        found("workflow", "refund", "Refund", "Workflow · acme"),
        found("skill", "refund-policy", "Refund policy", "Skill · acme"),
      ],
    });
    expect(read(content)).toEqual([
      "Agents, workflows and more:",
      "Refund · Workflow · acme",
      "Refund policy · Skill · acme",
      "Refund checker · Agent · acme",
      "Late refunds · Agent · acme",
      "Prefund check · Routine · acme",
    ]);
  });

  it("finds open and recent places by name, once, and says when a tab shows them", () => {
    const content = palette({
      words: "sup",
      openTabs: [home, supportReply],
      recent: [supportReply],
      found: [found("workflow", "support-reply", "Support reply", "Workflow · acme")],
    });
    expect(read(content)).toEqual([
      "Agents, workflows and more:",
      "Support reply · Workflow · acme · Switch to tab",
    ]);
    const row = content.groups[0]?.rows[0];
    expect(row?.match).toEqual({ rank: "starts-with", start: 0, end: 3 });
    expect(row?.target).toEqual({
      kind: "item",
      item: { kind: "workflow", hub: "acme", id: "support-reply" },
    });
  });

  it("lists the Actions whose title matches after the items", () => {
    const content = palette({
      words: "tab",
      openTabs: [home],
      actions: [
        { id: "shell.new-tab", title: "New tab" },
        { id: "shell.reopen", title: "Reopen closed tab" },
        { id: "shell.theme", title: "Switch to dark mode" },
        { id: "shell.tables", title: "Tables" },
      ],
    });
    expect(read(content)).toEqual(["Actions:", "Tables", "New tab", "Reopen closed tab"]);
    expect(content.groups[0]?.rows[0]?.target).toEqual({ kind: "action", command: "shell.tables" });
  });

  it("keeps each group's best 5 rows", () => {
    const content = palette({
      words: "run",
      found: ["#1", "#2", "#3", "#4", "#5", "#6"].map((id) => found("run", id, `Run ${id}`)),
    });
    expect(content.groups[0]?.rows.map((row) => row.label)).toEqual([
      "Run #1",
      "Run #2",
      "Run #3",
      "Run #4",
      "Run #5",
    ]);
  });

  it("says nothing matches when no place or item does, and still lists fitting Actions", () => {
    const content = palette({
      words: "refnud",
      openTabs: [home],
      actions: [{ id: "shell.new-tab", title: "New tab" }],
    });
    expect(content).toEqual({ groups: [], nothingFound: true, couldNotSearch: false });

    const withAction = palette({
      words: "new",
      actions: [{ id: "shell.new-tab", title: "New tab" }],
    });
    expect(withAction.nothingFound).toBe(true);
    expect(read(withAction)).toEqual(["Actions:", "New tab"]);
  });

  it("says it couldn't search, not that nothing matches, when a provider failed and nothing matches", () => {
    const content = palette({
      words: "refund",
      searchFailed: true,
      actions: [{ id: "shell.refund", title: "Refund a run" }],
    });
    expect(content.nothingFound).toBe(false);
    expect(content.couldNotSearch).toBe(true);
    expect(read(content)).toEqual(["Actions:", "Refund a run"]);
  });

  it("shows what the other providers found when one failed", () => {
    const content = palette({
      words: "sup",
      found: [found("workflow", "support-reply", "Support reply")],
      searchFailed: true,
    });
    expect(content.couldNotSearch).toBe(false);
    expect(content.nothingFound).toBe(false);
    expect(read(content)).toEqual(["Agents, workflows and more:", "Support reply"]);
  });

  it("shows no group for a source that isn't built yet", () => {
    expect(palette({})).toEqual({ groups: [], nothingFound: false, couldNotSearch: false });
  });
});
