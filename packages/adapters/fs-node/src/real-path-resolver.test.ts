import { link, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveRealPath } from "./real-path-resolver.ts";

verifies("fs-node.real-path-resolver", () => {
  let base = "";
  let project = "";
  let outside = "";

  beforeEach(async () => {
    base = await realpath(await mkdtemp(join(tmpdir(), "real-path-")));
    project = join(base, "project");
    outside = join(base, "outside");
    await mkdir(project);
    await mkdir(outside);
    await writeFile(join(outside, "secret"), "s");
    await writeFile(join(project, "file"), "f");
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it("gives a plain file's own real path", async () => {
    expect(await resolveRealPath(join(project, "file"))).toEqual({
      real: join(project, "file"),
      linked: false,
    });
  });

  it("follows a link to a file outside the project", async () => {
    await symlink(join(outside, "secret"), join(project, "key"));
    expect((await resolveRealPath(join(project, "key")))?.real).toBe(join(outside, "secret"));
  });

  it("follows a link to a folder, and a `..` after it", async () => {
    await symlink(outside, join(project, "dir"));
    expect((await resolveRealPath(join(project, "dir", "secret")))?.real).toBe(
      join(outside, "secret"),
    );
    expect((await resolveRealPath(`${project}/dir/../project/file`))?.real).toBe(
      join(project, "file"),
    );
    expect((await resolveRealPath(`${project}/dir/../outside`))?.real).toBe(outside);
  });

  it("adds the missing names to the nearest existing parent's real path", async () => {
    await symlink(outside, join(project, "dir"));
    expect(await resolveRealPath(join(project, "dir", "new", "deep.txt"))).toEqual({
      real: join(outside, "new", "deep.txt"),
      linked: false,
    });
  });

  it("gives nothing for a `..` in the part that isn't there", async () => {
    expect(await resolveRealPath(`${project}/new/../x`)).toBeNull();
    expect(await resolveRealPath(`${project}/new/./x`)).toBeNull();
  });

  it("gives nothing for a link to nothing, which a write would create", async () => {
    await symlink(join(outside, "not-there"), join(project, "dangling"));
    expect(await resolveRealPath(join(project, "dangling"))).toBeNull();
  });

  it("gives nothing for a loop of links", async () => {
    await symlink(join(project, "b"), join(project, "a"));
    await symlink(join(project, "a"), join(project, "b"));
    expect(await resolveRealPath(join(project, "a"))).toBeNull();
  });

  it("gives nothing for a name too long for the system", async () => {
    expect(await resolveRealPath(join(project, "x".repeat(5000)))).toBeNull();
  });

  describe("a file with more than one name", () => {
    it("is marked linked", async () => {
      await link(join(outside, "secret"), join(project, "copy"));
      expect(await resolveRealPath(join(project, "copy"))).toEqual({
        real: join(project, "copy"),
        linked: true,
      });
    });

    it("is not marked for a folder", async () => {
      expect((await resolveRealPath(project))?.linked).toBe(false);
    });
  });
});
