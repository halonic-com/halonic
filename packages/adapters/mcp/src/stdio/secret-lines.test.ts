import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { secretAndItsLines } from "./secret-lines.ts";

verifies("mcp.stdio-restart", () => {
  describe("secretAndItsLines", () => {
    it("keeps a secret with no line break as it is", () => {
      expect(secretAndItsLines("  acme-api-key  ")).toEqual(["  acme-api-key  "]);
    });

    it("adds each line of a secret with a line break, trimmed", () => {
      const key = "acme-key-start\n  acme-key-middle  \nacme-key-end";
      expect(secretAndItsLines(key)).toEqual([
        key,
        "acme-key-start",
        "acme-key-middle",
        "acme-key-end",
      ]);
    });

    it("splits on CRLF and leaves out blank and short lines", () => {
      const key = "acme-key-start\r\n\r\nacme-key-end\r\nAB==";
      expect(secretAndItsLines(key)).toEqual([key, "acme-key-start", "acme-key-end"]);
    });
  });
});
