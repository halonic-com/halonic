import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";

// Every program the machine probes start goes through this fake, so the test
// sees each one and nothing really runs.
const started = vi.hoisted(() => [] as { file: string; args: string[] }[]);
vi.mock("node:child_process", () => ({
  execFile: (file: string, args: string[], _options: unknown, done: (error: null) => void) => {
    started.push({ file, args });
    done(null);
  },
}));

const { systemMachine } = await import("./machine.ts");

verifies("sandbox-srt.check", () => {
  describe("what the machine probes start", () => {
    it("is only bwrap with fixed arguments, never a skill's scripts (HAL-188)", async () => {
      await systemMachine.insideContainer();
      await systemMachine.hasBubblewrap();
      await systemMachine.userNamespacesRestricted();
      await systemMachine.hasSeatbelt();
      expect(started).toEqual([
        { file: "bwrap", args: ["--version"] },
        { file: "bwrap", args: ["--ro-bind", "/", "/", "--unshare-user", "--", "true"] },
      ]);
    });
  });
});
