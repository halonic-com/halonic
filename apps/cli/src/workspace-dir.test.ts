import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { CliIo, CommandInput } from "./command.ts";
import { exitCode } from "./exit-code.ts";
import { exitCodeFor } from "./exit-code-for.ts";
import { NoWorkspaceError, openWorkspaceDir, workspaceDir } from "./workspace-dir.ts";

let cwd: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "halonic-workspace-dir-"));
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

/** The command line `halonic <command> [--dir <dir>]`, as `runCli` reads it. */
function inputWith(dir?: string): CommandInput {
  return { positionals: [], options: dir === undefined ? {} : { dir } };
}

/** An io that works from `folder` and drops what's written. */
function ioIn(folder: string): CliIo {
  return { cwd: folder, out: () => {}, err: () => {} };
}

/** A folder with a `workspace.yaml` in it. */
function makeWorkspace(folder: string): void {
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "workspace.yaml"), "id: acme\nname: Acme\n");
}

verifies("cli.workspace-dir", () => {
  it("opens the folder given with --dir and shows it as the user would type it", async () => {
    makeWorkspace(join(cwd, "acme"));
    const opened = await openWorkspaceDir(inputWith("acme"), ioIn(cwd));
    expect(opened.root).toBe(join(cwd, "acme"));
    expect(opened.shown).toBe(`.${sep}acme`);
    expect(opened.name).toBe("acme");
    expect(await opened.store.read("workspace.yaml")).toContain("id: acme");
  });

  it("opens the current folder without --dir", async () => {
    makeWorkspace(cwd);
    const opened = await openWorkspaceDir(inputWith(), ioIn(cwd));
    expect(opened.root).toBe(cwd);
    expect(opened.shown).toBe(".");
  });

  it("stops with not_found when the folder has no workspace.yaml, or doesn't exist", async () => {
    mkdirSync(join(cwd, "downloads"));
    for (const dir of ["downloads", "missing"]) {
      const error = await openWorkspaceDir(inputWith(dir), ioIn(cwd)).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NoWorkspaceError);
      expect(exitCodeFor(errorKindOf(error))).toBe(exitCode.notFound);
      expect(error).toMatchObject({
        code: "no-workspace",
        message: "there's no workspace.yaml here.",
        fix: "Run it inside a workspace, or create one with halonic init.",
      });
    }
  });

  // Windows has no read permission bits, and root reads any folder.
  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "[platform:win32] needs POSIX modes: stops with invalid_input when the folder can't be read",
    async () => {
      const acme = join(cwd, "acme");
      makeWorkspace(acme);
      chmodSync(acme, 0o000);
      try {
        const error = await openWorkspaceDir(inputWith("acme"), ioIn(cwd)).catch((e: unknown) => e);
        expect(errorKindOf(error)).toBe("invalid_input");
        expect(exitCodeFor(errorKindOf(error))).toBe(exitCode.usage);
        expect(error).toMatchObject({
          message: "the folder can't be read.",
          fix: "Check the folder's permissions.",
        });
      } finally {
        chmodSync(acme, 0o755);
      }
    },
  );

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "[platform:win32] needs POSIX modes: names a workspace.yaml that can't be read in a folder that can",
    async () => {
      const acme = join(cwd, "acme");
      makeWorkspace(acme);
      chmodSync(join(acme, "workspace.yaml"), 0o000);
      try {
        const error = await openWorkspaceDir(inputWith("acme"), ioIn(cwd)).catch((e: unknown) => e);
        expect(errorKindOf(error)).toBe("invalid_input");
        expect(exitCodeFor(errorKindOf(error))).toBe(exitCode.usage);
        expect(error).toMatchObject({
          message: "the workspace file workspace.yaml can't be read.",
          fix: "Check the file's permissions, or move it out of the workspace.",
        });
      } finally {
        chmodSync(join(acme, "workspace.yaml"), 0o644);
      }
    },
  );

  it("never uses the workspace of a parent folder", async () => {
    makeWorkspace(cwd);
    const below = join(cwd, "notes");
    mkdirSync(below);
    await expect(openWorkspaceDir(inputWith(), ioIn(below))).rejects.toBeInstanceOf(
      NoWorkspaceError,
    );
  });

  it("works out the folder without reading anything", () => {
    expect(workspaceDir(inputWith(join("..", "other")), join(cwd, "acme"))).toEqual({
      root: join(cwd, "other"),
      shown: join("..", "other"),
      name: "other",
    });
  });
});
