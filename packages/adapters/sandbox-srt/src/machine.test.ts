import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { systemMachine } from "./machine.ts";

verifies("sandbox-srt.check", () => {
  describe("systemMachine", () => {
    it("answers every probe with a yes or no on this machine, and never throws", async () => {
      const answers = [
        await systemMachine.insideContainer(),
        await systemMachine.hasBubblewrap(),
        await systemMachine.userNamespacesRestricted(),
        await systemMachine.hasSeatbelt(),
      ];
      expect(answers.map((answer) => typeof answer)).toEqual([
        "boolean",
        "boolean",
        "boolean",
        "boolean",
      ]);
    });

    it("names the platform Node runs on", () => {
      expect(systemMachine.platform).toBe(process.platform);
    });
  });
});
