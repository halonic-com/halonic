import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { homeDeniedGroups, homeDeniedPaths } from "./denied-groups.ts";
import { realPathOnDisk } from "./install-folders.ts";

const disk = { realPath: realPathOnDisk };
let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "hlt-home-"));
  await mkdir(join(home, ".ssh"));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

verifies("harness-kit.home-denied-paths", () => {
  it("keeps a path that isn't there yet, at the real place of the folder it would be made in", async () => {
    const real = await realpath(home);
    const paths = await homeDeniedPaths(home, "linux", disk);
    expect(paths).toContain(join(real, ".ssh"));
    expect(paths).toContain(join(real, ".aws"));
    expect(paths).toContain(join(real, ".config", "gcloud"));
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("still names only the groups with a path that is there", async () => {
    const groups = await homeDeniedGroups(home, "linux", disk);
    expect(groups).toEqual([{ code: "ssh-keys", paths: [join(await realpath(home), ".ssh")] }]);
  });
});
