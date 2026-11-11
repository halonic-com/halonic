import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { procVersionIsWsl1, systemMachine } from "./machine.ts";

vi.mock("node:child_process", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:child_process")>();
  return { ...real, execFile: vi.fn(real.execFile) };
});

/** Runs a program and says whether it exited with code 0. */
function succeeds(file: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: 5000 }, (error) => resolve(error === null));
  });
}

verifies("sandbox-srt.check", () => {
  describe("systemMachine", () => {
    it("answers every probe on this machine, and never throws", async () => {
      const answers = [
        await systemMachine.insideContainer(),
        await systemMachine.isWsl1(),
        await systemMachine.hasBubblewrap(),
        await systemMachine.appArmorRestrictsUserNamespaces(),
        await systemMachine.hasSeatbelt(),
        await systemMachine.hasWindowsSandbox(),
      ];
      expect(answers.map((answer) => typeof answer)).toEqual([
        "boolean",
        "boolean",
        "boolean",
        "boolean",
        "boolean",
        "boolean",
      ]);
      const helpers = await systemMachine.missingLinuxHelpers();
      expect(helpers.filter((helper) => helper !== "socat" && helper !== "ripgrep")).toEqual([]);
      const error = await systemMachine.bubblewrapUserNamespaceError();
      expect(error === null || (error !== "" && !error.includes("\n"))).toBe(true);
    });

    it("agrees with an independent user namespace check when bubblewrap is there", async () => {
      const error = await systemMachine.bubblewrapUserNamespaceError();
      if (process.platform !== "linux" || !(await systemMachine.hasBubblewrap())) {
        // Nothing to compare with here; CI on Linux has bubblewrap.
        expect(typeof error === "string" || error === null).toBe(true);
        return;
      }
      // Ubuntu 24.04 refuses `unshare` but lets bubblewrap through its own AppArmor
      // profile, so `unshare` is only a fair witness when that setting is off or missing.
      const setting = await readFile(
        "/proc/sys/kernel/apparmor_restrict_unprivileged_userns",
        "utf8",
      ).catch(() => "");
      const allowed =
        setting.trim() === "1"
          ? await succeeds("bwrap", ["--ro-bind", "/", "/", "--unshare-user", "--", "true"])
          : await succeeds("unshare", ["-U", "true"]);
      expect(error === null).toBe(allowed);
    });

    it("reads the AppArmor setting as on only when it exists and says 1", async () => {
      const setting = await readFile(
        "/proc/sys/kernel/apparmor_restrict_unprivileged_userns",
        "utf8",
      ).catch(() => "");
      expect(await systemMachine.appArmorRestrictsUserNamespaces()).toBe(setting.trim() === "1");
    });

    it("names the platform Node runs on", () => {
      expect(systemMachine.platform).toBe(process.platform);
    });
  });

  describe("the programs it starts", () => {
    it("starts only bwrap, socat and rg, with fixed arguments and no input from a caller", async () => {
      // The probes are asked once per module, so earlier tests may have asked them
      // already. A fresh copy of the module asks them again, on every runner.
      vi.resetModules();
      const fresh = await import("./machine.ts");
      const started = vi.mocked((await import("node:child_process")).execFile);
      started.mockClear();
      await fresh.systemMachine.hasBubblewrap();
      await fresh.systemMachine.missingLinuxHelpers();
      await fresh.systemMachine.bubblewrapUserNamespaceError();
      // The runner is not exported: only the fixed probes above can start a program.
      // One expect for however many programs this machine started, so the test makes
      // the same number of expect calls on every machine.
      const programs = started.mock.calls.map(([file, args]) => ({
        file,
        first: (args as string[])[0],
      }));
      const unexpected = programs.filter(
        ({ file, first }) =>
          !["bwrap", "socat", "rg"].includes(file) ||
          !["--version", "-V", "--ro-bind"].includes(first ?? ""),
      );
      expect(unexpected).toEqual([]);
      // Whatever is installed, the three version probes always start.
      expect(programs).toEqual(
        expect.arrayContaining([
          { file: "bwrap", first: "--version" },
          { file: "socat", first: "-V" },
          { file: "rg", first: "--version" },
        ]),
      );
      expect(Object.keys(fresh).sort()).toEqual([
        "cgroupNamesContainer",
        "procVersionIsWsl1",
        "systemMachine",
      ]);
    });
  });

  describe("procVersionIsWsl1", () => {
    // /proc/version as each kernel writes it.
    const wsl1 =
      "Linux version 4.4.0-19041-Microsoft (Microsoft@Microsoft.com) (gcc version 5.4.0 (GCC) ) #1237-Microsoft Sat Sep 11 14:32:00 PST 2021\n";
    const wsl2Before510 =
      "Linux version 4.19.128-microsoft-standard (oe-user@oe-host) (gcc version 8.2.0 (GCC)) #1 SMP Tue Jun 23 12:58:10 UTC 2020\n";
    const wsl2 =
      "Linux version 6.6.87.2-microsoft-standard-WSL2 (root@439a258ad544) (gcc (GCC) 11.2.0, GNU ld (GNU Binutils) 2.37) #1 SMP PREEMPT_DYNAMIC Thu Jun  5 18:30:46 UTC 2025\n";
    const ubuntu =
      "Linux version 6.8.0-45-generic (buildd@lcy02-amd64-115) (x86_64-linux-gnu-gcc-13 (Ubuntu 13.2.0-23ubuntu4) 13.2.0, GNU ld (GNU Binutils for Ubuntu) 2.42) #45-Ubuntu SMP PREEMPT_DYNAMIC Fri Aug 30 12:02:04 UTC 2024\n";

    it("sees WSL 1's kernel", () => {
      expect(procVersionIsWsl1(wsl1)).toBe(true);
    });

    it("doesn't take WSL 2's kernels, old or new, or a plain Linux one for WSL 1", () => {
      expect(procVersionIsWsl1(wsl2Before510)).toBe(false);
      expect(procVersionIsWsl1(wsl2)).toBe(false);
      expect(procVersionIsWsl1(ubuntu)).toBe(false);
      expect(procVersionIsWsl1("")).toBe(false);
    });
  });
});
