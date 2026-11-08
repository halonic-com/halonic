import { describe, expect, it } from "vitest";
import { parsedValue, problemsOf, summary, yaml } from "../../test/parse.ts";

describe("format.runtime-file", () => {
  it("fills in options", () => {
    expect(parsedValue("runtime", yaml("id: inprocess", "type: inprocess"))).toEqual({
      version: 1,
      id: "inprocess",
      type: "inprocess",
      options: {},
    });
  });

  it("refuses options that aren't a map", () => {
    const text = yaml("id: inprocess", "type: inprocess", "options: fast");
    expect(summary(problemsOf("runtime", text))).toEqual(["options invalid_type 3"]);
  });

  it("refuses version 2", () => {
    const text = yaml("version: 2", "id: inprocess", "type: inprocess");
    expect(summary(problemsOf("runtime", text))).toEqual(["version invalid_value 1"]);
  });
});
