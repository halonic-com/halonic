import { basename, dirname, join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Every program the host starts goes through this fake, so the test sees each
// one and nothing really runs.
const started = vi.hoisted(
  () => [] as { file: string; args: string[]; env: Record<string, string | undefined> }[],
);
vi.mock("node:child_process", () => ({
  execFile: (
    file: string,
    args: string[],
    options: { env: Record<string, string | undefined> },
    done: (error: null, stdout: Buffer, stderr: Buffer) => void,
  ) => {
    started.push({ file, args, env: options.env });
    done(null, Buffer.from(""), Buffer.from(""));
  },
}));

const { systemWslHost } = await import("./system-host.ts");

verifies("sandbox-srt.wsl-setup", () => {
  describe("what the WSL host starts", () => {
    beforeEach(() => {
      started.length = 0;
      vi.stubEnv("SystemRoot", "C:\\Windows"); // leak-guard: allow absolute-path Windows' own folder
    });
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("is only wsl.exe, reg.exe and powershell.exe from System32, never a shell", async () => {
      const host = systemWslHost();
      await host.bootedAt();
      await host.policy();
      await host.status();
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

    it("never hands WSLENV to wsl.exe, so no Windows variable crosses into the distro", async () => {
      vi.stubEnv("WSLENV", "USERPROFILE/p");
      await systemWslHost().runInDistro("halonic", ["true"]);
      expect(started).toHaveLength(1);
      expect(Object.keys(started[0]?.env ?? {}).map((name) => name.toUpperCase())).not.toContain(
        "WSLENV",
      );
      expect(started[0]?.env["WSL_UTF8"]).toBe("1");
    });

    it("starts nothing when SystemRoot isn't a folder on a drive", async () => {
      const climbsOut = "C:\\Windows\\..\\Users"; // leak-guard: allow absolute-path made-up folder
      for (const root of ["%SystemRoot%", "Windows", climbsOut]) {
        vi.stubEnv("SystemRoot", root);
        const result = await systemWslHost().installWsl();
        expect(result.code).toBeNull();
      }
      expect(started).toEqual([]);
    });

    it("quotes a quote in SystemRoot in the elevated PowerShell line", async () => {
      vi.stubEnv("SystemRoot", "C:\\Win'; Remove-Item x; '"); // leak-guard: allow absolute-path made-up folder
      await systemWslHost().updateWsl();
      const script = started[0]?.args.at(-1) ?? "";
      expect(script).toContain("-FilePath 'C:\\Win''; Remove-Item x; ''"); // leak-guard: allow absolute-path made-up folder
      expect(script).toContain("-ArgumentList '--update'");
    });

    it("quotes PowerShell's typographic single quotes in SystemRoot too", async () => {
      vi.stubEnv("SystemRoot", "C:\\Win\u2019; Remove-Item x; \u2018"); // leak-guard: allow absolute-path made-up folder
      await systemWslHost().updateWsl();
      const script = started[0]?.args.at(-1) ?? "";
      expect(script).toContain("-FilePath 'C:\\Win\u2019\u2019; Remove-Item x; \u2018\u2018"); // leak-guard: allow absolute-path made-up folder
    });
  });
});
