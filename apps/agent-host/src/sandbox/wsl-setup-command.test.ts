import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import type { WslHost } from "@halonicjs/adapter-sandbox-srt";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type HostIo, run } from "../host.ts";
import { type WslSetupMachine, wslSetupCommand } from "./wsl-setup-command.ts";

const IMAGE = "Z:\\Halonic\\halonic-wsl.tar.gz"; // leak-guard: allow absolute-path example
const LOCAL_APP_DATA = "Z:\\AppData\\Local"; // leak-guard: allow absolute-path example
const IMAGE_WITH_PARENT = "Z:\\a\\..\\b.tar.gz"; // leak-guard: allow absolute-path example
const RESUME = '"Z:\\Halonic\\Halonic.exe"'; // leak-guard: allow absolute-path example

let profile = "";

beforeEach(async () => {
  profile = await mkdtemp(join(tmpdir(), "halonic-wsl-setup-"));
});

afterEach(async () => {
  await rm(profile, { recursive: true, force: true });
});

/** A Windows machine with WSL in place (or not), recording every call the setup makes. */
function fakeWindows(options: { wslInstalled: boolean }) {
  const calls: string[] = [];
  const distros: Awaited<ReturnType<WslHost["distros"]>> = [];
  const state = { installed: options.wslInstalled, runOnce: null as string | null };
  const ok = (output = "") => ({ code: 0, output });
  const host: WslHost = {
    windowsBuild: async () => 22631,
    bootedAt: async () => "boot-1",
    policy: async () => ({ allowWsl: undefined }),
    status: async () =>
      state.installed
        ? ok("Default Version: 2")
        : { code: 1, output: "The Windows Subsystem for Linux is not installed." },
    distros: async () => [...distros],
    installWsl: async () => {
      calls.push("wsl --install");
      state.installed = true;
      return { code: 3010, output: "", cancelled: false };
    },
    updateWsl: async () => ({ code: 0, output: "", cancelled: false }),
    importDistro: async (name, location, rootfs) => {
      calls.push(`wsl --import ${name} ${location} ${rootfs}`);
      distros.push({ name, state: "Stopped", version: 2, isDefault: false });
      return ok();
    },
    runInDistro: async (_name, program) => {
      if (program[0] === "uname") return ok("6.6.87.2-microsoft-standard-WSL2\n");
      if (program[0] === "test") return { code: 1, output: "" };
      return ok('{"current":"","image":"1"}');
    },
    installRuntime: async () => {
      calls.push("install runtime");
      return ok();
    },
    setRunOnce: async (command) => {
      state.runOnce = command;
    },
    clearRunOnce: async () => {
      state.runOnce = null;
    },
  };
  const machine: WslSetupMachine = {
    platform: "win32",
    env: { LOCALAPPDATA: LOCAL_APP_DATA },
    host: () => host,
  };
  return { machine, calls, state };
}

function output(): { io: Pick<HostIo, "write">; lines: string[] } {
  const lines: string[] = [];
  return { io: { write: (text) => void lines.push(text) }, lines };
}

const setupArgs = () => ["--wsl-setup", "--wsl-image", IMAGE, "--wsl-resume", RESUME];

verifies("agent-host.wsl-setup-command", () => {
  describe("--wsl-setup", () => {
    it("imports Halonic's distro under LOCALAPPDATA, records the import, and leaves the runtime to the shell", async () => {
      const windows = fakeWindows({ wslInstalled: true });
      const { io, lines } = output();

      expect(await wslSetupCommand(setupArgs(), profile, io, windows.machine)).toBe(0);

      expect(windows.calls).toEqual([
        `wsl --import halonic ${LOCAL_APP_DATA}\\Halonic\\wsl\\halonic ${IMAGE}`,
      ]);
      expect(lines).toEqual(['{"outcome":"done","residuals":[],"runtime":"left-to-shell"}\n']);
      const saved = JSON.parse(await readFile(join(profile, "sandbox", "wsl-setup.json"), "utf8"));
      expect(saved).toEqual({
        step: "done",
        importedDistro: { name: "halonic", location: `${LOCAL_APP_DATA}\\Halonic\\wsl\\halonic` },
      });
    });

    it("says a restart is needed, with RunOnce set to the shell's command, and exits with 1", async () => {
      const windows = fakeWindows({ wslInstalled: false });
      const { io, lines } = output();

      expect(await wslSetupCommand(setupArgs(), profile, io, windows.machine)).toBe(1);

      expect(lines).toEqual(['{"outcome":"restart-needed"}\n']);
      expect(windows.state.runOnce).toBe(RESUME);
    });

    it.each([
      ["in-distro", "win32", ["--wsl-shared-folders"]],
      ["not-windows", "linux", []],
    ] as const)("refuses with %s and runs no step", async (code, platform, extra) => {
      const windows = fakeWindows({ wslInstalled: true });
      const machine = { ...windows.machine, platform };
      const { io, lines } = output();

      expect(await wslSetupCommand([...setupArgs(), ...extra], profile, io, machine)).toBe(1);

      expect(JSON.parse(lines[0] ?? "")).toMatchObject({ outcome: "refused", code });
      expect(windows.calls).toEqual([]);
    });

    it.each([
      ["no profile folder", setupArgs(), false, LOCAL_APP_DATA],
      [
        "a relative image",
        ["--wsl-setup", "--wsl-image", "image.tar.gz", "--wsl-resume", RESUME],
        true,
        LOCAL_APP_DATA,
      ],
      [
        "an image with ..",
        ["--wsl-setup", "--wsl-image", IMAGE_WITH_PARENT, "--wsl-resume", RESUME],
        true,
        LOCAL_APP_DATA,
      ],
      [
        "no resume command",
        ["--wsl-setup", "--wsl-image", IMAGE, "--wsl-resume"],
        true,
        LOCAL_APP_DATA,
      ],
      [
        "a flag in place of the image",
        ["--wsl-setup", "--wsl-image", "--wsl-resume", RESUME],
        true,
        LOCAL_APP_DATA,
      ],
      ["a relative LOCALAPPDATA", setupArgs(), true, "AppData"],
      [
        "a resume command whose program isn't quoted",
        ["--wsl-setup", "--wsl-image", IMAGE, "--wsl-resume", "Halonic.exe --resume"],
        true,
        LOCAL_APP_DATA,
      ],
      [
        "a resume command whose quoted program isn't on a drive",
        ["--wsl-setup", "--wsl-image", IMAGE, "--wsl-resume", '"Halonic.exe" --resume'],
        true,
        LOCAL_APP_DATA,
      ],
    ])(
      "refuses %s as bad-flags and runs no step",
      async (_name, args, withProfile, localAppData) => {
        const windows = fakeWindows({ wslInstalled: true });
        const machine = { ...windows.machine, env: { LOCALAPPDATA: localAppData } };
        const { io, lines } = output();

        const profileFolder = withProfile ? profile : undefined;
        expect(await wslSetupCommand(args, profileFolder, io, machine)).toBe(1);

        expect(JSON.parse(lines[0] ?? "")).toMatchObject({ outcome: "refused", code: "bad-flags" });
        expect(windows.calls).toEqual([]);
      },
    );

    it.each([
      ["a relative profile folder", "profile"],
      ["a profile folder with ..", "Z:\\a\\..\\profile"], // leak-guard: allow absolute-path example
    ])("refuses %s as bad-flags and runs no step", async (_name, profileFolder) => {
      const windows = fakeWindows({ wslInstalled: true });
      const { io, lines } = output();

      expect(await wslSetupCommand(setupArgs(), profileFolder, io, windows.machine)).toBe(1);

      expect(JSON.parse(lines[0] ?? "")).toMatchObject({ outcome: "refused", code: "bad-flags" });
      expect(windows.calls).toEqual([]);
    });

    it("ends as an error, with RunOnce's failure in the detail, when RunOnce can't be set", async () => {
      const windows = fakeWindows({ wslInstalled: false });
      const host = windows.machine.host();
      const machine: WslSetupMachine = {
        ...windows.machine,
        host: () => ({
          ...host,
          setRunOnce: async () => {
            throw new Error("reg add RunOnce: exit 1: Access is denied.");
          },
        }),
      };
      const { io, lines } = output();

      expect(await wslSetupCommand(setupArgs(), profile, io, machine)).toBe(1);

      expect(JSON.parse(lines[0] ?? "")).toEqual({
        outcome: "error",
        detail: "reg add RunOnce: exit 1: Access is denied.",
      });
      expect(windows.calls).toEqual([]);
    });

    it("ends as an error, never an empty state, when the saved state isn't valid", async () => {
      await mkdir(join(profile, "sandbox"));
      await writeFile(join(profile, "sandbox", "wsl-setup.json"), '{"step":"somewhere"}');
      const windows = fakeWindows({ wslInstalled: true });
      const { io, lines } = output();

      expect(await wslSetupCommand(setupArgs(), profile, io, windows.machine)).toBe(1);

      expect(JSON.parse(lines[0] ?? "")).toMatchObject({ outcome: "error" });
      expect(windows.calls).toEqual([]);
    });

    it("runs from the host's arguments without serving, and refuses off Windows here", async () => {
      const lines: string[] = [];
      const io: HostIo = {
        input: new PassThrough(),
        write: (text) => void lines.push(text),
        writeError: () => {},
        takeOutput: () => new PassThrough(),
      };
      const args = ["--profile-folder", profile, ...setupArgs(), "--wsl-shared-folders"];

      expect(await run(args, "1.2.3", io)).toBe(1);

      expect(JSON.parse(lines[0] ?? "")).toMatchObject({ outcome: "refused", code: "in-distro" });
    });
  });
});
