import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import {
  assertWindowsFolder,
  driveMountOptions,
  IMPORT_MOUNTS_FOLDER,
  type ImportStep,
  mountCommand,
  type WslDistro,
  withImportMount,
} from "./wsl-mounts.ts";

const folder = "C:\\Work\\acme"; // leak-guard: allow absolute-path a made-up Windows folder for a test

const point = `${IMPORT_MOUNTS_FOLDER}/import-${"a".repeat(32)}`;

/** A distro whose updater answers `steps`; commands as `halonic` aren't expected here. */
function fakeDistro(
  steps: (step: ImportStep) => { code: number; stdout?: string } = (step) =>
    step[0] === "import-mount" ? { code: 0, stdout: `${point}\n` } : { code: 0 },
) {
  const calls: Array<{ step: ImportStep; input: string | undefined }> = [];
  const distro: WslDistro = {
    async run(argv) {
      throw new Error(`unexpected command ${argv.join(" ")}`);
    },
    async runtime(step, input) {
      calls.push({ step, input });
      const { code, stdout = "" } = steps(step);
      return { code, stdout };
    },
  };
  return { distro, calls };
}

verifies("sandbox-srt.wsl-mounts", () => {
  describe("mounts", () => {
    it("mounts through the updater's fixed step, with the folder on standard input only", async () => {
      const { distro, calls } = fakeDistro();
      const seen: string[] = [];
      await withImportMount(distro, folder, async (mounted) => void seen.push(mounted));
      expect(seen).toEqual([point]);
      expect(calls).toEqual([
        { step: ["import-mount"], input: `${folder}\n` },
        { step: ["import-unmount", `import-${"a".repeat(32)}`], input: undefined },
      ]);
    });

    it("unmounts when the use throws, and rethrows its error", async () => {
      const { distro, calls } = fakeDistro();
      await expect(
        withImportMount(distro, folder, async () => {
          throw new Error("clone failed");
        }),
      ).rejects.toThrow("clone failed");
      expect(calls.at(-1)?.step[0]).toBe("import-unmount");
    });

    it("unmounts nothing when the mount itself failed", async () => {
      const { distro, calls } = fakeDistro(() => ({ code: 1 }));
      await expect(withImportMount(distro, folder, async () => 1)).rejects.toThrow(
        "import-mount failed",
      );
      expect(calls.map((c) => c.step[0])).toEqual(["import-mount"]);
    });

    it.each([
      "/tmp/import-x", // leak-guard: allow absolute-path a made-up path in the distro for a test
      `${IMPORT_MOUNTS_FOLDER}/acme`,
      `${IMPORT_MOUNTS_FOLDER}/../import-${"a".repeat(32)}`,
      "",
    ])("refuses %j as the mount point the updater printed", async (printed) => {
      const { distro } = fakeDistro(() => ({ code: 0, stdout: printed }));
      const use = vi.fn(async () => 1);
      await expect(withImportMount(distro, folder, use)).rejects.toThrow("not an import mount");
      expect(use).not.toHaveBeenCalled();
    });

    it("reports a mount that can't be unmounted", async () => {
      const { distro } = fakeDistro((step) =>
        step[0] === "import-mount" ? { code: 0, stdout: point } : { code: 7 },
      );
      await expect(withImportMount(distro, folder, async () => 1)).rejects.toThrow(
        "import-unmount failed",
      );
    });

    it("refuses a bad folder before the updater runs", async () => {
      const { distro, calls } = fakeDistro();
      await expect(withImportMount(distro, "C:", async () => 1)).rejects.toThrow(
        "Windows drive path",
      );
      expect(calls).toEqual([]);
    });

    it("mounts a drive project for the halonic user only, without set-id files or devices", () => {
      const options = driveMountOptions(1000, 1000).split(",");
      expect(options).toEqual(
        expect.arrayContaining(["uid=1000", "gid=1000", "umask=077", "nosuid", "nodev"]),
      );
      expect(options).not.toContain("exec");
      expect(() => driveMountOptions(-1, 0)).toThrow();
      expect(() => driveMountOptions(1.5, 0)).toThrow();
    });

    it.each([
      "relative\\path",
      "\\\\server\\share",
      "C:",
      "C:\\", // leak-guard: allow absolute-path a made-up Windows folder for a test
      "C:\\.", // leak-guard: allow absolute-path a made-up Windows folder for a test
      "C:\\a\\.", // leak-guard: allow absolute-path a made-up Windows folder for a test
      "C:\\a\\\\b", // leak-guard: allow absolute-path a made-up Windows folder for a test
      "C:\\a\\..\\b", // leak-guard: allow absolute-path a made-up Windows folder for a test
      "C:\\a\\", // leak-guard: allow absolute-path a made-up Windows folder for a test
      "C:\\a\u0000b", // leak-guard: allow absolute-path a made-up Windows folder for a test
      "C:\\a\u007fb", // leak-guard: allow absolute-path a made-up Windows folder for a test
      "/mnt/c",
    ])("refuses the folder %j", (path) => {
      expect(() => assertWindowsFolder(path)).toThrow("Windows drive path");
      expect(() => mountCommand(path, "/mnt/halonic/x", "ro")).toThrow();
    });

    it("mounts the one folder it is given, never a parent", () => {
      expect(mountCommand(folder, "/mnt/halonic/acme", "ro")).toEqual([
        "mount",
        "-t",
        "drvfs",
        folder,
        "/mnt/halonic/acme",
        "-o",
        "ro",
      ]);
    });
  });
});
