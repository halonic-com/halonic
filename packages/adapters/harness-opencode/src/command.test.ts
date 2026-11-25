import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { opencodeCommand } from "./command.ts";

verifies("harness-opencode.command", () => {
  describe("opencodeCommand", () => {
    it("runs a private server, approves all but denied tools, and names the title", () => {
      expect(opencodeCommand({ agentId: "writer" })).toEqual({
        program: "opencode",
        args: [
          "run",
          "--standalone",
          "--auto",
          "--archived",
          "--format",
          "json",
          "--title",
          "writer",
        ],
      });
    });

    it("never connects to another server and passes no prompt in the arguments", () => {
      const { args } = opencodeCommand({ agentId: "writer" });
      expect(args).not.toContain("--server");
      expect(args.filter((arg) => !arg.startsWith("--"))).toEqual(["run", "json", "writer"]);
    });
  });
});
