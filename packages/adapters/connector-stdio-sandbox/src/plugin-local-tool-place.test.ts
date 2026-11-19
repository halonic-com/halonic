import type { ConnectorPin } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { localToolLaunch, type StdioConfig } from "./local-tool-launch.ts";
import { type PluginLocalToolSetting, pluginLocalToolPlace } from "./plugin-local-tool-place.ts";

const setting: PluginLocalToolSetting = {
  workingFolder: "/halonic/launch-1",
  tempFolder: "/halonic/launch-2",
  pluginCopy: "/halonic/launch-3/plugin",
  deniedPaths: ["/person/.ssh", "/halonic/data", "/person/.ssh"],
  bridge: null,
  timeLimitMs: 60_000,
  path: "/usr/bin",
};

const script: StdioConfig = {
  kind: "stdio",
  command: "node",
  args: ["/halonic/launch-3/plugin/tools/server.js"],
  env: { NOTES_ROOT: "/person/notes" },
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

    expect(profile.workingFolder).toBe("/halonic/launch-1");
    expect(profile.tempFolder).toBe("/halonic/launch-2");
    expect(profile.readOnlyPaths).toEqual(["/halonic/launch-3/plugin"]);
    expect(profile.deniedPaths).toEqual(["/person/.ssh", "/halonic/data"]);
    expect(profile.network).toEqual({ bridge: null, allowedSites: ["api.notes.test"] });
    expect(profile.timeLimitMs).toBe(60_000);
    expect(profile.env).toMatchObject({
      NOTES_ROOT: "/person/notes",
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
    ["the plugin's own folder in Halonic's data", "/halonic/data/plugins/notes"],
    ["a folder in the working folder", "/halonic/launch-1/plugin"],
    ["a denied path itself", "/person/.ssh"],
    ["the working folder itself", "/halonic/launch-1"],
    // Spellings that lead into a denied path (HAL-13056).
    ["a way back into Halonic's data", "/halonic/launch-3/../data/plugins/notes"],
    ["a denied path with a trailing slash", "/person/.ssh/"],
    ["a denied path with doubled slashes", "//halonic//data//plugins"],
    ["a way into the working folder through a dot", "/halonic/./launch-1/plugin"],
  ])("refuses %s as the plugin's copy", (_, pluginCopy) => {
    expect(() => pluginLocalToolPlace(script, { ...setting, pluginCopy })).toThrow(RangeError);
  });

  it("takes a copy next to a denied folder whose name starts the same", () => {
    const place = pluginLocalToolPlace(script, { ...setting, pluginCopy: "/person/.ssh-notes" });

    expect(place.readOnlyPaths).toEqual(["/person/.ssh-notes"]);
  });
});
