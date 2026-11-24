import type { CodingToolsServer, SandboxFence } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { codingToolsCommand } from "./coding-tools-server.ts";

const server: CodingToolsServer = {
  program: "/opt/halonic/node",
  args: ["/opt/halonic/cli.js", "coding-tools"],
  codePaths: ["/opt/halonic"],
};

function sessionWith(fence: SandboxFence | undefined, timeLimitMs = 600_000) {
  return { fence, profile: { tempFolder: "/sessions/one/temp", timeLimitMs } } as Parameters<
    typeof codingToolsCommand
  >[1];
}

verifies("harness-kit.coding-tools-server", () => {
  describe("codingToolsCommand", () => {
    it("gives a fenced run the server with its temp folder, the choice and the step's time limit", () => {
      expect(
        codingToolsCommand({ codingTools: server }, sessionWith({ state: "fenced" }), "read-only"),
      ).toEqual({
        command: "/opt/halonic/node",
        args: [
          "/opt/halonic/cli.js",
          "coding-tools",
          "--temp-folder",
          "/sessions/one/temp",
          "--tools",
          "read-only",
          "--max-test-seconds",
          "600",
        ],
      });
    });

    it("leaves the time limit to the server when the step's is under 10 seconds", () => {
      const command = codingToolsCommand(
        { codingTools: server },
        sessionWith({ state: "fenced" }, 9_999),
        "all",
      );

      expect(command?.args).not.toContain("--max-test-seconds");
    });

    it.each<[string, SandboxFence | undefined]>([
      ["off", { state: "off" }],
      ["not fenced", { state: "not-fenced", reason: "A probe got through." }],
      ["stopped", { state: "stopped" }],
      ["unknown", { state: "fenced-ish" } as unknown as SandboxFence],
      ["missing", undefined],
    ])("gives no server when the fence state is %s", (_name, fence) => {
      expect(codingToolsCommand({ codingTools: server }, sessionWith(fence), "all")).toBeNull();
    });

    it("gives no server when the task names none", () => {
      expect(codingToolsCommand({}, sessionWith({ state: "fenced" }), "all")).toBeNull();
    });
  });
});
