import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConnectorPin } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localToolLaunch, type StdioConfig } from "./local-tool-launch.ts";
import { type PluginLocalToolSetting, pluginLocalToolPlace } from "./plugin-local-tool-place.ts";

// The place takes only absolute paths, and on Windows those start with a drive.
const drive = process.platform === "win32" ? "C:" : "";

const setting: PluginLocalToolSetting = {
  workingFolder: `${drive}/halonic/launch-1`,
  tempFolder: `${drive}/halonic/launch-2`,
  pluginCopy: `${drive}/halonic/launch-3/plugin`,
  deniedPaths: [`${drive}/person/.ssh`, `${drive}/halonic/data`, `${drive}/person/.ssh`],
  bridge: null,
  timeLimitMs: 60_000,
  path: "/usr/bin",
};

const script: StdioConfig = {
  kind: "stdio",
  command: "node",
  args: [`${drive}/halonic/launch-3/plugin/tools/server.js`],
  env: { NOTES_ROOT: `${drive}/person/notes` },
  sites: ["api.notes.test"],
};

const pin: ConnectorPin = {
  registry: "npm",
  registryUrl: "https://registry.npmjs.org",
  package: "@acme/notes-mcp",
  version: "1.2.3",
};

verifies("connector-stdio-sandbox.plugin-local-tool-place", () => {
  it("lets a script read only the plugin's copy, denies the host's paths and allows only its network", () => {
    const { profile } = localToolLaunch(script, pluginLocalToolPlace(script, setting), null, {
      NOTES_TOKEN: "token-value",
    });

    expect(profile.workingFolder).toBe(`${drive}/halonic/launch-1`);
    expect(profile.tempFolder).toBe(`${drive}/halonic/launch-2`);
    expect(profile.readOnlyPaths).toEqual([`${drive}/halonic/launch-3/plugin`]);
    expect(profile.deniedPaths).toEqual([`${drive}/person/.ssh`, `${drive}/halonic/data`]);
    expect(profile.network).toEqual({ bridge: null, allowedSites: ["api.notes.test"] });
    expect(profile.timeLimitMs).toBe(60_000);
    expect(profile.env).toMatchObject({
      NOTES_ROOT: `${drive}/person/notes`,
      NOTES_TOKEN: "token-value",
      PATH: "/usr/bin",
    });
  });

  it("gives a pinned package nothing of the plugin to read", () => {
    const pinned: StdioConfig = { ...script, command: "npx", args: ["@acme/notes-mcp"], pin };

    expect(pluginLocalToolPlace(pinned, setting).readOnlyPaths).toEqual([]);
  });

  it("gives a tool without a network nothing but the bridge", () => {
    const { sites: _sites, ...noSites } = script;
    const bridge = { kind: "loopback", host: "127.0.0.1", port: 7 } as const;

    const place = pluginLocalToolPlace(noSites, { ...setting, bridge });

    expect(place.sites).toEqual([]);
    expect(place.bridge).toEqual(bridge);
  });

  it.each([
    ["the plugin's own folder in Halonic's data", `${drive}/halonic/data/plugins/notes`],
    ["a folder in the working folder", `${drive}/halonic/launch-1/plugin`],
    ["a denied path itself", `${drive}/person/.ssh`],
    ["the working folder itself", `${drive}/halonic/launch-1`],
    // Spellings that lead into a denied path (HAL-13056).
    ["a way back into Halonic's data", `${drive}/halonic/launch-3/../data/plugins/notes`],
    ["a denied path with a trailing slash", `${drive}/person/.ssh/`],
    ["a denied path with doubled slashes", `${drive}//halonic//data//plugins`],
    ["a way into the working folder through a dot", `${drive}/halonic/./launch-1/plugin`],
    ["a folder holding a denied path", `${drive}/person`],
    ["the root", `${drive}/`],
    ["a folder holding the working folder", `${drive}/halonic`],
    ["the temp folder", `${drive}/halonic/launch-2`],
    ["a folder in the temp folder", `${drive}/halonic/launch-2/plugin`],
    ["a denied path in other letter case", `${drive}/Person/.SSH/plugin`],
  ])("refuses %s as the plugin's copy", (_, pluginCopy) => {
    expect(() => pluginLocalToolPlace(script, { ...setting, pluginCopy })).toThrow(RangeError);
  });

  it.each([
    ["the plugin's copy", { pluginCopy: "launch-3/plugin" }],
    ["the working folder", { workingFolder: "./launch-1" }],
    ["the temp folder", { tempFolder: "launch-2" }],
    ["a denied path", { deniedPaths: [`${drive}/person/.ssh`, ".ssh"] }],
  ])("refuses a relative path as %s", (_, change: Partial<PluginLocalToolSetting>) => {
    expect(() => pluginLocalToolPlace(script, { ...setting, ...change })).toThrow(RangeError);
  });

  it("refuses a path that Windows reads against the current drive", () => {
    expect(() =>
      pluginLocalToolPlace(script, { ...setting, pluginCopy: "\\halonic\\launch-3\\plugin" }),
    ).toThrow(RangeError);
  });

  it("takes a copy next to a denied folder whose name starts the same", () => {
    const place = pluginLocalToolPlace(script, {
      ...setting,
      pluginCopy: `${drive}/person/.ssh-notes`,
    });

    expect(place.readOnlyPaths).toEqual([`${drive}/person/.ssh-notes`]);
  });

  describe("with links", () => {
    let root: string;

    beforeAll(async () => {
      root = await realpath(await mkdtemp(join(tmpdir(), "plugin-local-tool-place-")));
      await mkdir(join(root, "data", "plugins", "notes"), { recursive: true });
      await mkdir(join(root, "launch-3"));
      // A junction on Windows, which needs no extra rights there.
      const kind = process.platform === "win32" ? "junction" : "dir";
      await symlink(join(root, "data"), join(root, "launch-3", "into-data"), kind);
      await symlink(join(root, "launch-3"), join(root, "launches"), kind);
    });

    afterAll(async () => {
      await rm(root, { recursive: true, force: true });
    });

    function placeIn(pluginCopy: string): PluginLocalToolSetting {
      return {
        ...setting,
        workingFolder: join(root, "launch-1"),
        tempFolder: join(root, "launch-2"),
        pluginCopy,
        deniedPaths: [join(root, "data")],
      };
    }

    it("refuses a copy reached through a link into a denied path", () => {
      const copy = join(root, "launch-3", "into-data", "plugins", "notes");

      expect(() => pluginLocalToolPlace(script, placeIn(copy))).toThrow(RangeError);
    });

    it("takes a copy reached through a link that stays clear of every denied path", () => {
      const copy = join(root, "launches", "plugin");

      expect(pluginLocalToolPlace(script, placeIn(copy)).readOnlyPaths).toEqual([copy]);
    });
  });
});
