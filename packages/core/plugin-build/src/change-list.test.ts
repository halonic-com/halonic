import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { changeList } from "./change-list.ts";

verifies("plugin-build.change-list", () => {
  it("lists every tool as added without a previous build, sorted", () => {
    expect(changeList(undefined, { tools: [{ name: "b" }, { name: "a" }] })).toEqual({
      added: ["a", "b"],
      removed: [],
      changed: [],
    });
  });

  it("lists added, removed and changed tools, with the changed fields sorted", () => {
    const previous = {
      tools: [
        { name: "old" },
        { name: "a", description: "Old words.", parameters: { type: "object" }, hint: "x" },
        { name: "same", description: "Kept." },
      ],
    };
    const current = {
      tools: [
        { name: "new" },
        { name: "same", description: "Kept." },
        { name: "a", description: "New words.", parameters: { type: "object" }, icon: "y" },
      ],
    };
    expect(changeList(previous, current)).toEqual({
      added: ["new"],
      removed: ["old"],
      changed: [{ tool: "a", fields: ["description", "hint", "icon"] }],
    });
  });

  it("sorts the changed tools by name", () => {
    const previous = {
      tools: [
        { name: "b", x: 1 },
        { name: "a", x: 1 },
      ],
    };
    const current = {
      tools: [
        { name: "b", x: 2 },
        { name: "a", x: 2 },
      ],
    };
    expect(changeList(previous, current).changed.map((change) => change.tool)).toEqual(["a", "b"]);
  });

  it("doesn't count keys in another order as a change", () => {
    const previous = { tools: [{ name: "a", parameters: { type: "object", required: ["id"] } }] };
    const current = { tools: [{ name: "a", parameters: { required: ["id"], type: "object" } }] };
    expect(changeList(previous, current).changed).toEqual([]);
  });

  it("names the routing entries whose agent differs, added and removed ones included, sorted", () => {
    const previous = {
      tools: [],
      routing: { roles: { "code-reviewer": "liam", clarifier: "liam" }, areas: { docs: "maya" } },
    };
    const current = {
      tools: [],
      routing: {
        roles: { "code-reviewer": "julian", clarifier: "liam" },
        areas: { studio: "elena" },
      },
    };
    expect(changeList(previous, current).routing).toEqual([
      "areas.docs",
      "areas.studio",
      "roles.code-reviewer",
    ]);
  });

  it("names every routing entry of a first build, and leaves routing out when it didn't change", () => {
    const routing = { roles: { "code-reviewer": "liam" }, areas: { docs: "maya" } };
    expect(changeList(undefined, { tools: [], routing }).routing).toEqual([
      "areas.docs",
      "roles.code-reviewer",
    ]);
    expect("routing" in changeList({ tools: [], routing }, { tools: [], routing })).toBe(false);
    expect("routing" in changeList({ tools: [] }, { tools: [] })).toBe(false);
  });
});
