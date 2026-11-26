import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { toolscriptFormat } from "./index.ts";

describe("toolscriptFormat", () => {
  verifies("toolscript.format", () => {
    it("is the name and revision a header must carry", () => {
      expect(toolscriptFormat).toBe("halonic.toolscript/1");
    });
  });
});
