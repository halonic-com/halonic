import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { restartRunsOfWindow } from "./restart-runs.ts";

verifies("studio.restart-runs", () => {
  describe("restartRunsOfWindow", () => {
    it("reports no run while the window starts none", async () => {
      expect(await restartRunsOfWindow.count()).toEqual({ running: 0, waitingForYou: 0 });
    });
  });
});
