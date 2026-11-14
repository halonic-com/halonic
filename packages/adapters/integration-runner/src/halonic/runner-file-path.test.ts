import { isAbsolute, join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { runnerFile } from "./runner-file-path.ts";

verifies("integration-runner.runner-file-path", () => {
  describe("runnerFile", () => {
    it("is the absolute path of dist/runner.mjs in this package", () => {
      const file = runnerFile();
      expect(isAbsolute(file)).toBe(true);
      expect(file.endsWith(join("integration-runner", "dist", "runner.mjs"))).toBe(true);
    });
  });
});
