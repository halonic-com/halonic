import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { readTable } from "./table.ts";

verifies("plugins.plugin-text", () => {
  describe("readTable", () => {
    it("has a column for every key, in the order it first appears", () => {
      expect(readTable('[{"day":"Mon","high":21},{"day":"Tue","rain":true}]')).toEqual({
        columns: ["day", "high", "rain"],
        rows: [
          ["Mon", "21", ""],
          ["Tue", "", "true"],
        ],
      });
    });

    it("shows null as empty and a list or object as its JSON", () => {
      expect(readTable('[{"a":null,"b":[1,2],"c":{"d":"<b>"}}]')?.rows).toEqual([
        ["", "[1,2]", '{"d":"<b>"}'],
      ]);
    });

    it("never reads a missing cell from the row's prototype", () => {
      expect(readTable('[{"constructor":"x"},{"a":1}]')?.rows).toEqual([
        ["x", ""],
        ["", "1"],
      ]);
    });

    it.each([
      ["not JSON", "It's sunny"],
      ["an object", '{"day":"Mon"}'],
      ["an empty list", "[]"],
      ["a list of lists", "[[1,2]]"],
      ["a list with null", '[{"a":1},null]'],
      ["a string", '"text"'],
    ])("isn't a table for %s", (_name, source) => {
      expect(readTable(source)).toBeNull();
    });
  });
});
