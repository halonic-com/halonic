import { basename, dirname, join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";

// Every program the host starts goes through this fake, so the test sees each
// one and nothing really runs.
const started = vi.hoisted(() => [] as { file: string; args: string[] }[]);
vi.mock("node:child_process", () => ({
  execFile: (
    file: string,
    args: string[],
    _options: unknown,
    done: (error: null, stdout: Buffer, stderr: Buffer) => void,
  ) => {
    started.push({ file, args });
    done(null, Buffer.from(""), Buffer.from(""));
  },
}));

const { systemWslHost } = await import("./system-host.ts");

verifies("sandbox-srt.wsl-setup", () => {
  describe("what the WSL host starts", () => {
    it("is only wsl.exe, reg.exe and powershell.exe from System32, never a shell", async () => {
      const host = systemWslHost();
      await host.bootedAt();
      await host.policy();
      await host.status();
      await host.version();
      await host.distros();
      await host.installWsl();
      await host.updateWsl();
      await host.importDistro("halonic", "%LOCALAPPDATA%\\wsl", "image.tar.gz");
      await host.runInDistro("halonic", ["true"]);
      await host.setRunOnce("Halonic.exe --resume");
      await host.clearRunOnce();

      const names = new Set(started.map((entry) => basename(entry.file).toLowerCase()));
      expect([...names].sort()).toEqual(["powershell.exe", "reg.exe", "wsl.exe"]);
      for (const entry of started) {
        expect(basename(dirname(entry.file)).toLowerCase()).toMatch(/^(system32|v1\.0)$/);
      }
      expect(join(dirname(started[0]?.file ?? ""))).toContain("WindowsPowerShell");
    });
  });
});
