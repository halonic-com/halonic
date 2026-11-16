import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { importWindowsProject } from "./wsl-import.ts";
import type { WslRoot } from "./wsl-mounts.ts";

// From parts, so the leak guard doesn't read the distro's fixed home as one machine's.
const project = ["/home", "halonic", "projects", "acme"].join("/");
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

/** Answers by the first marker word found in the command; a missing repository root has no remotes, and the project doesn't exist yet. */
function answersBy(table: Record<string, { code: number; stdout?: string }>) {
  return (argv: readonly string[]) => {
    const marker = Object.keys(table).find((key) => argv.includes(key) || argv[0] === key);
    return (marker && table[marker]) || { code: 0 };
  };
}

verifies("sandbox-srt.wsl-import", () => {
  describe("import", () => {
    it("clones from the read-only mount and puts the source's remotes back", async () => {
      const { root, calls } = fakeRoot((argv) => {
        if (argv[0] === "test") return { code: 1 };
        if (argv.includes("--get-regexp"))
          return { code: 0, stdout: "remote.origin.url\nhttps://example.com/acme.git\0" };
        return { code: 0 };
      });
      const path = await importWindowsProject(root, folder, "acme");
      expect(path).toBe(project);
      const clone = calls.find((c) => c.includes("clone"));
      expect(clone?.at(-1)).toBe(path);
      expect(clone?.at(-2)).toMatch(/^\/mnt\/halonic-import\/import-[0-9a-f]{32}$/);
      expect(calls).toContainEqual([
        "git",
        "-C",
        path,
        "remote",
        "add",
        "origin",
        "--",
        "https://example.com/acme.git",
      ]);
      expect(calls.map((c) => c[0]).slice(-3)).toEqual(["umount", "rmdir", "chown"]);
    });

    it("copies modified and untracked files and deletes the deleted ones", async () => {
      const { root, calls } = fakeRoot(
        answersBy({
          test: { code: 1 },
          "--get-regexp": { code: 1 },
          "--deleted": { code: 0, stdout: "old.txt\0" },
          "--modified": { code: 0, stdout: "src/a.ts\0" },
          "--others": { code: 0, stdout: "new.txt\0" },
        }),
      );
      await importWindowsProject(root, folder, "acme");
      const copied = calls.filter((c) => c[0] === "cp").map((c) => c.at(-1));
      expect(copied).toEqual([`${project}/src/a.ts`, `${project}/new.txt`]);
      expect(calls).toContainEqual(["rm", "-f", "--", `${project}/old.txt`]);
    });

    it("refuses a file path that reaches out of the project", async () => {
      const { root } = fakeRoot((argv) => {
        if (argv[0] === "test") return { code: 1 };
        if (argv.includes("--get-regexp")) return { code: 1 };
        if (argv.includes("--modified")) return { code: 0, stdout: "../../etc/x\0" };
        return { code: 0 };
      });
      await expect(importWindowsProject(root, folder, "acme")).rejects.toThrow("isn't a path");
    });

    it("removes what it made and unmounts when the folder isn't a git repository", async () => {
      const { root, calls } = fakeRoot((argv) => {
        if (argv[0] === "test") return { code: 1 };
        if (argv.includes("rev-parse")) return { code: 128 };
        return { code: 0 };
      });
      await expect(importWindowsProject(root, folder, "acme")).rejects.toThrow(
        "isn't a git repository",
      );
      expect(calls.map((c) => c[0])).toEqual(expect.arrayContaining(["umount", "rmdir", "rm"]));
    });

    it("refuses a project that already exists and touches nothing", async () => {
      const { root, calls } = fakeRoot(() => ({ code: 0 }));
      await expect(importWindowsProject(root, folder, "acme")).rejects.toThrow("already exists");
      expect(calls).toHaveLength(1);
    });

    it("refuses a bad project name", async () => {
      const { root } = fakeRoot(() => ({ code: 0 }));
      await expect(importWindowsProject(root, folder, "../x")).rejects.toThrow();
    });
  });
});
