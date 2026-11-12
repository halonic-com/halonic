import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";

// Every program the machine probes start goes through this fake, so the test
// sees each one and nothing really runs.
const started = vi.hoisted(() => [] as { file: string; args: string[] }[]);
vi.mock("node:child_process", () => ({
  execFile: (
    file: string,
    args: string[],
    _options: unknown,
    done: (error: null, stdout: string, stderr: string) => void,
  ) => {
    started.push({ file, args });
    done(null, "", "");
  },
}));

const { systemMachine } = await import("./machine.ts");

verifies("sandbox-srt.check", () => {
  describe("what the machine probes start", () => {
    it("is only bwrap, socat and rg with fixed arguments, never a skill's scripts (HAL-188)", async () => {
      await systemMachine.insideContainer();
      await systemMachine.isWsl1();
      await systemMachine.hasBubblewrap();
      await systemMachine.missingLinuxHelpers();
      await systemMachine.hasRipgrep(); // asked once: the Linux helpers already started rg
      await systemMachine.bubblewrapUserNamespaceError();
      await systemMachine.appArmorRestrictsUserNamespaces();
      await systemMachine.hasSeatbelt();
      await systemMachine.hasWindowsSandbox(); // starts srt-win only on Windows
      expect(started).toEqual([
        { file: "bwrap", args: ["--version"] },
        { file: "socat", args: ["-V"] },
        { file: "rg", args: ["--version"] },
        { file: "bwrap", args: ["--ro-bind", "/", "/", "--unshare-user", "--", "true"] },
      ]);
    });
  });
});
