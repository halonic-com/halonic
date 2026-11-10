import { unwrap } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { editYaml, type YamlEdited } from "./edit.ts";
import { applyEditToData, type YamlEdit } from "./edit-data.ts";

function edited(text: string, edit: YamlEdit): YamlEdited {
  return unwrap(editYaml(text, [edit]));
}

const lines = (...all: string[]) => `${all.join("\n")}\n`;

const workflow = lines(
  "states:",
  "  read:",
  "    agent: writer",
  "  # sorts the mail",
  "  classify:",
  "    agent: sorter",
  "  draft:",
  "    agent: writer",
);

verifies("yaml.edit-new-key-place", () => {
  it("puts a new key right after the sibling `after` names", () => {
    const result = edited(workflow, {
      kind: "set",
      path: ["states", "triage"],
      value: { agent: "sorter" },
      after: "read",
    });
    expect(result).toEqual({
      layout: "kept",
      text: lines(
        "states:",
        "  read:",
        "    agent: writer",
        "  triage:",
        "    agent: sorter",
        "  # sorts the mail",
        "  classify:",
        "    agent: sorter",
        "  draft:",
        "    agent: writer",
      ),
    });
  });

  it("puts a new key first, above the comments over the first entry, for `after: null`", () => {
    const result = edited(lines("# the id", "id: x", "name: X"), {
      kind: "set",
      path: ["model"],
      value: "small",
      after: null,
    });
    expect(result.text).toBe(lines("model: small", "# the id", "id: x", "name: X"));
  });

  it("puts a new key at the end when `after` names a key that isn't there", () => {
    const result = edited(lines("id: x", "name: X"), {
      kind: "set",
      path: ["model"],
      value: "small",
      after: "missing",
    });
    expect(result.text).toBe(lines("id: x", "name: X", "model: small"));
  });

  it("leaves a key that is already there in its place", () => {
    const result = edited(lines("id: x", "name: X"), {
      kind: "set",
      path: ["name"],
      value: "Y",
      after: null,
    });
    expect(result.text).toBe(lines("id: x", "name: Y"));
  });

  it("keeps the place when the edit is written through the parsed document", () => {
    const mixed = "a: 1\r\nc: 3\n";
    const result = edited(mixed, { kind: "set", path: ["b"], value: 2, after: "a" });
    expect(result.layout).toBe("reformatted");
    expect(result.text.replaceAll("\r\n", "\n")).toBe(lines("a: 1", "b: 2", "c: 3"));
  });

  it("puts a new key first through the parsed document too", () => {
    const result = edited("a: 1\r\nc: 3\n", { kind: "set", path: ["b"], value: 2, after: null });
    expect(result.text.replaceAll("\r\n", "\n")).toBe(lines("b: 2", "a: 1", "c: 3"));
  });

  it("puts a new key right after `after` in a flow map", () => {
    const flow = lines("name: X", "env: {A: 1, C: 3}");
    const result = edited(flow, { kind: "set", path: ["env", "B"], value: 2, after: "A" });
    expect(result.text).toBe(lines("name: X", "env: {A: 1, B: 2, C: 3}"));
    const first = edited(flow, { kind: "set", path: ["env", "B"], value: 2, after: null });
    expect(first.text).toBe(lines("name: X", "env: {B: 2, A: 1, C: 3}"));
  });

  it("puts a new key in its place in the data, which a rewritten file is written from", () => {
    const data = { a: 1, c: 3 };
    const set = (after: string | null) =>
      Object.keys(
        unwrap(applyEditToData(data, { kind: "set", path: ["b"], value: 2, after })) as object,
      );
    expect(set("a")).toEqual(["a", "b", "c"]);
    expect(set(null)).toEqual(["b", "a", "c"]);
    expect(set("missing")).toEqual(["a", "c", "b"]);
    expect(Object.keys(data)).toEqual(["a", "c"]);
  });
});
