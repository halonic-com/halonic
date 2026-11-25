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
});
