import { describe, expect, it } from "vitest";
import { listedToolChangeLabel } from "./listed-tool-change-label.ts";

describe("listedToolChangeLabel", () => {
  it("names the tool's own texts", () => {
    expect(listedToolChangeLabel("name")).toEqual({ kind: "name" });
    expect(listedToolChangeLabel("description")).toEqual({ kind: "description" });
    expect(listedToolChangeLabel("parameters/required")).toEqual({ kind: "required" });
  });

  it("names the argument and its field", () => {
    expect(listedToolChangeLabel("parameters/properties/id/description")).toEqual({
      kind: "argument",
      argument: "id",
      field: "description",
    });
  });

  it("undoes JSON-pointer escapes", () => {
    expect(listedToolChangeLabel("parameters/properties/a~1b/type")).toEqual({
      kind: "argument",
      argument: "a/b",
      field: "type",
    });
  });

  it("shows any other path without its parameters prefix", () => {
    expect(listedToolChangeLabel("parameters/properties/id/items/type")).toEqual({
      kind: "other",
      path: "properties/id/items/type",
    });
  });
});
