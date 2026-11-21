import { link, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { resolveRealPath } from "./real-path.ts";

const windows = process.platform === "win32";

let base: string;
let worktree: string;
let outside: string;

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "halonic-real-path-")));
  worktree = join(base, "worktree");
  outside = join(base, "home", ".ssh");
  await mkdir(join(worktree, "src"), { recursive: true });
  await mkdir(outside, { recursive: true });
  await writeFile(join(worktree, "src", "a.ts"), "export {};\n");
  await writeFile(join(outside, "config"), "Host acme\n");
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

verifies("harness-kit.real-path", () => {
  it("gives a file's own path, not linked", async () => {
    expect(await resolveRealPath(join(worktree, "src", "a.ts"))).toEqual({
      real: join(worktree, "src", "a.ts"),
      linked: false,
    });
  });

  it("gives a new file its folder's real path and its name", async () => {
    expect(await resolveRealPath(join(worktree, "src", "new", "b.ts"))).toEqual({
      real: join(worktree, "src", "new", "b.ts"),
      linked: false,
    });
  });

  it("follows a linked folder to where a new file would land", async () => {
    await symlink(outside, join(worktree, "keys"));

    expect((await resolveRealPath(join(worktree, "keys", "new-key")))?.real).toBe(
      join(outside, "new-key"),
    );
  });

  it("resolves `..` as the system does: after a link on Linux and macOS, by name on Windows", async () => {
    await symlink(outside, join(worktree, "keys"));

    // Joined by hand: `join` would fold `..` by name, to the worktree's own `config`.
    expect((await resolveRealPath(`${worktree}/keys/../config`))?.real).toBe(
      windows ? join(worktree, "config") : join(base, "home", "config"),
    );
  });

  it("gives nothing for a dangling link, which a write would follow", async () => {
    await symlink(join(outside, "not-yet"), join(worktree, "dangling"));

    expect(await resolveRealPath(join(worktree, "dangling"))).toBeNull();
  });

  it("gives nothing for `..` in the part that isn't there, except on Windows, which folds it by name", async () => {
    const resolved = await resolveRealPath(`${worktree}/missing/../../x`);

    if (windows) expect(resolved).toEqual({ real: join(base, "x"), linked: false });
    else expect(resolved).toBeNull();
  });

  it("says a file with a second name is linked", async () => {
    await link(join(outside, "config"), join(worktree, "src", "config"));

    expect(await resolveRealPath(join(worktree, "src", "config"))).toEqual({
      real: join(worktree, "src", "config"),
      linked: true,
    });
  });
});
