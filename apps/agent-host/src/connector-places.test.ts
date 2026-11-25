import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { homeDeniedPaths, realPathOnDisk } from "@halonicjs/adapter-harness-kit";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it } from "vitest";
import { connectorPlaces } from "./connector-places.ts";

let folder: string;

beforeEach(async () => {
  folder = await realpath(await mkdtemp(join(tmpdir(), "halonic-connector-places-")));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

verifies("agent-host.connector-routes", () => {
  it("denies a workspace connector the profile and the person's credential folders, as a plugin's local tool", async () => {
    const profile = join(folder, "profile");
    const home = { folder, platform: "linux" as const, realPath: realPathOnDisk };

    const places = await connectorPlaces([join(folder, "acme"), profile], profile, home);

    expect(places.workspaceRoots).toEqual([join(folder, "acme")]);
    expect(places.deniedPaths).toEqual([
      profile,
      ...(await homeDeniedPaths(folder, "linux", { realPath: realPathOnDisk })),
    ]);
    expect(places.deniedPaths).toEqual(
      expect.arrayContaining([join(folder, ".ssh"), join(folder, ".aws")]),
    );
  });
});
