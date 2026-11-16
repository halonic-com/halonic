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
      // no links in the fake distro, unless a test says so
      if (argv[0] === "realpath" && stdout === "") return { code, stdout: `${argv.at(-1)}\n` };
      return { code, stdout };
    },
  };
  return { root, calls };
}

/** A distro where the project doesn't exist and the source has no remote, except for what `special` answers. */
function distro(
  special: (argv: readonly string[]) => { code: number; stdout?: string } | undefined,
) {
  return fakeRoot((argv) => {
    const special_ = special(argv);
    if (special_) return special_;
    return { code: argv[0] === "test" || argv.includes("--get-regexp") ? 1 : 0 };
  });
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

    it("lists the changes with the clone's git folder, never the source's config", async () => {
      const { root, calls } = fakeRoot(
        answersBy({ test: { code: 1 }, "--get-regexp": { code: 1 } }),
      );
      await importWindowsProject(root, folder, "acme");
      const lists = calls.filter((c) => c.includes("ls-files"));
      expect(lists).toHaveLength(3);
      for (const list of lists) {
        expect(list.slice(0, 3)).toEqual([
          "git",
          `--git-dir=${project}/.git`,
          expect.stringMatching(/^--work-tree=\/mnt\/halonic-import\/import-/),
        ]);
        expect(list.join(" ")).not.toContain("safe.directory");
      }
    });

    it("refuses to write through a link in the clone that leads out of the project", async () => {
      const { root, calls } = distro((argv) => {
        if (argv.includes("--others")) return { code: 0, stdout: "link/evil\0" };
        if (argv[0] === "realpath" && argv.at(-1) === `${project}/link`)
          return { code: 0, stdout: "/etc/cron.d\n" };
        return undefined;
      });
      await expect(importWindowsProject(root, folder, "acme")).rejects.toThrow(
        "outside the project",
      );
      expect(calls.filter((c) => c[0] === "cp")).toEqual([]);
      expect(calls.filter((c) => c[0] === "mkdir" && c.at(-1)?.includes("link"))).toEqual([]);
    });

    it("refuses to delete through a link in the clone that leads out of the project", async () => {
      const { root, calls } = distro((argv) => {
        if (argv.includes("--deleted")) return { code: 0, stdout: "link/victim\0" };
        if (argv[0] === "realpath" && argv.at(-1) === `${project}/link`)
          return { code: 0, stdout: "/etc\n" };
        return undefined;
      });
      await expect(importWindowsProject(root, folder, "acme")).rejects.toThrow(
        "outside the project",
      );
      expect(calls.filter((c) => c[0] === "rm" && c.includes("-f"))).toEqual([]);
    });

    it("copies an untracked nested repository and skips a modified submodule's folder", async () => {
      const { root, calls } = distro((argv) => {
        if (argv.includes("--modified")) return { code: 0, stdout: "sub\0" };
        if (argv.includes("--others")) return { code: 0, stdout: "nested/\0" };
        if (argv[0] === "test" && argv[1] === "-d" && argv[2]?.endsWith("/sub")) return { code: 0 };
        return undefined;
      });
      await importWindowsProject(root, folder, "acme");
      const copied = calls.filter((c) => c[0] === "cp").map((c) => c.at(-1));
      expect(copied).toEqual([`${project}/nested`]);
    });

    it("keeps the source's other local branches when it drops the clone's origin", async () => {
      const { root, calls } = fakeRoot(
        answersBy({ test: { code: 1 }, "--get-regexp": { code: 1 } }),
      );
      await importWindowsProject(root, folder, "acme");
      const fetch = calls.findIndex((c) => c.includes("fetch"));
      const drop = calls.findIndex((c) => c.includes("remove"));
      expect(calls[fetch]).toContain("+refs/heads/*:refs/heads/*");
      expect(fetch).toBeGreaterThan(-1);
      expect(fetch).toBeLessThan(drop);
    });

    it("gives a projects folder it made to the halonic user, and says which remote it skipped", async () => {
      const { root, calls } = fakeRoot((argv) => {
        if (argv[0] === "test") return { code: 1 };
        if (argv.includes("--get-regexp"))
          return { code: 0, stdout: "remote.-bad.url\nhttps://example.com/x.git\0" };
        return { code: 0 };
      });
      const skipped: string[] = [];
      await importWindowsProject(root, folder, "acme", (remote) => skipped.push(remote));
      expect(skipped).toEqual(["-bad"]);
      expect(calls).toContainEqual([
        "chown",
        "halonic:halonic",
        "--",
        expect.stringContaining("projects"),
      ]);
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
