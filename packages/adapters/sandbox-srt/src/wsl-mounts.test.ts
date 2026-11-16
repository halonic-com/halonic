import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  assertWindowsFolder,
  cleanupImportMounts,
  driveMountOptions,
  IMPORT_MOUNTS_FOLDER,
  mountCommand,
  type WslRoot,
  withImportMount,
} from "./wsl-mounts.ts";

const folder = "C:\\Work\\acme"; // leak-guard: allow absolute-path a made-up Windows folder for a test

function fakeRoot(answers: (argv: readonly string[]) => { code: number; stdout?: string }) {
  const calls: string[][] = [];
  const root: WslRoot = {
    async run(argv) {
      calls.push([...argv]);
      const { code, stdout = "" } = answers(argv);
      return { code, stdout };
    },
  };
  return { root, calls };
}

verifies("sandbox-srt.wsl-mounts", () => {
  describe("mounts", () => {
    it("mounts the import read-only with noexec, nosuid and nodev", async () => {
      const { root, calls } = fakeRoot(() => ({ code: 0 }));
      await withImportMount(root, folder, async () => undefined);
      const mount = calls.find((c) => c[0] === "mount");
      const options = mount?.[mount.indexOf("-o") + 1]?.split(",");
      expect(options).toEqual(expect.arrayContaining(["ro", "noexec", "nosuid", "nodev"]));
      expect(mount).toContain(folder);
    });

    it("gives each import a fresh random mount point under its own folder", async () => {
      const seen: string[] = [];
      for (let i = 0; i < 2; i++) {
        const { root } = fakeRoot(() => ({ code: 0 }));
        await withImportMount(root, folder, async (point) => void seen.push(point));
      }
      expect(seen[0]).not.toBe(seen[1]);
      for (const point of seen)
        expect(point).toMatch(new RegExp(`^${IMPORT_MOUNTS_FOLDER}/import-[0-9a-f]{32}$`));
    });

    it("unmounts and removes the mount point when the use throws, and rethrows its error", async () => {
      const { root, calls } = fakeRoot(() => ({ code: 0 }));
      await expect(
        withImportMount(root, folder, async () => {
          throw new Error("clone failed");
        }),
      ).rejects.toThrow("clone failed");
      expect(calls.map((c) => c[0]).slice(-2)).toEqual(["umount", "rmdir"]);
    });

    it("removes the mount point without unmounting when the mount itself failed", async () => {
      // like the real umount: it fails on a folder that isn't mounted
      const { root, calls } = fakeRoot((a) => {
        if (a[0] === "mount") return { code: 32 };
        if (a[0] === "umount") return { code: 32 };
        return { code: 0 };
      });
      await expect(withImportMount(root, folder, async () => 1)).rejects.toThrow("mount failed");
      const names = calls.map((c) => c[0]);
      expect(names).not.toContain("umount");
      expect(names.at(-1)).toBe("rmdir");
    });

    it("reports a mount that can't be unmounted", async () => {
      const { root } = fakeRoot((a) => ({ code: a[0] === "umount" ? 32 : 0 }));
      await expect(withImportMount(root, folder, async () => 1)).rejects.toThrow("umount failed");
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

  describe("cleanupImportMounts", () => {
    it("unmounts and rmdirs leftovers with this module's names only", async () => {
      const left = `import-${"a".repeat(32)}`;
      const { root, calls } = fakeRoot((a) => ({
        code: 0,
        stdout: a[0] === "ls" ? `${left}\nsomething-else\n..\n` : "",
      }));
      expect(await cleanupImportMounts(root)).toEqual([]);
      expect(calls.slice(1)).toEqual([
        ["umount", "--", `${IMPORT_MOUNTS_FOLDER}/${left}`],
        ["rmdir", "--", `${IMPORT_MOUNTS_FOLDER}/${left}`],
      ]);
    });

    it("does nothing when there is no import folder, and lists what it couldn't remove", async () => {
      expect(await cleanupImportMounts(fakeRoot(() => ({ code: 2 })).root)).toEqual([]);
      const left = `import-${"b".repeat(32)}`;
      const { root } = fakeRoot((a) => ({
        code: a[0] === "rmdir" ? 1 : 0,
        stdout: a[0] === "ls" ? left : "",
      }));
      expect(await cleanupImportMounts(root)).toEqual([`${IMPORT_MOUNTS_FOLDER}/${left}`]);
    });
  });
});
