import type { ConnectorPin } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { testPlace } from "./fake-mcp-program.spec.ts";
import { type LocalToolPlace, localToolLaunch, type StdioConfig } from "./local-tool-launch.ts";

const script: StdioConfig = {
  kind: "stdio",
  command: "node",
  args: ["server.js"],
  env: { NOTES_MODE: "quiet" },
};

const npmPin: ConnectorPin = {
  registry: "npm",
  registryUrl: "https://registry.npmjs.org",
  package: "@acme/notes-mcp",
  version: "1.2.3",
};

const npx: StdioConfig = {
  kind: "stdio",
  command: "npx",
  args: ["-y", "@acme/notes-mcp"],
  env: { NOTES_MODE: "quiet" },
  pin: npmPin,
};

/** The place of a pinned tool: the runner the host found in `/acme/bin`. */
const pinnedPlace: LocalToolPlace = {
  ...testPlace,
  runner: {
    found: { program: "/acme/bin/npx", leadingArgs: [], pathFolders: ["/acme/bin"] },
    platform: "linux",
  },
};

verifies("connector-stdio-sandbox.local-tool-profile", () => {
  describe("localToolLaunch", () => {
    it("builds a script's profile from the place, its settings and its secrets only", () => {
      const { profile, command } = localToolLaunch(script, testPlace, null, {
        NOTES_TOKEN: "token-value",
      });
      expect(profile).toEqual({
        workingFolder: testPlace.workingFolder,
        tempFolder: testPlace.tempFolder,
        settingsFolder: null,
        readOnlyPaths: testPlace.readOnlyPaths,
        deniedPaths: testPlace.deniedPaths,
        env: {
          NOTES_MODE: "quiet",
          PATH: testPlace.path,
          HOME: testPlace.workingFolder,
          TMPDIR: testPlace.tempFolder,
          TEMP: testPlace.tempFolder,
          TMP: testPlace.tempFolder,
          NOTES_TOKEN: "token-value",
        },
        network: { bridge: null, allowedSites: ["notes.acme.test"] },
        timeLimitMs: testPlace.timeLimitMs,
      });
      expect(command).toEqual({ program: "node", args: ["server.js"] });
    });

    it("lets Halonic's own variables win over a setting of the same name", () => {
      const sneaky = { ...script, env: { PATH: "/plugin/bin", HOME: "/elsewhere" } };
      const { env } = localToolLaunch(sneaky, testPlace, null, {}).profile;
      expect(env["PATH"]).toBe(testPlace.path);
      expect(env["HOME"]).toBe(testPlace.workingFolder);
    });

    it("starts a pinned package as the pinned launcher does, with only PATH inherited", () => {
      const { profile, command } = localToolLaunch(npx, pinnedPlace, npmPin, {});
      expect(command).toEqual({ program: "/acme/bin/npx", args: ["-y", "@acme/notes-mcp@1.2.3"] });
      expect(profile.env).toMatchObject({
        NOTES_MODE: "quiet",
        HOME: testPlace.workingFolder,
        npm_config_registry: "https://registry.npmjs.org",
        PATH: `/acme/bin:${testPlace.path}`,
      });
      expect(profile.network.allowedSites).toEqual(["notes.acme.test", "registry.npmjs.org"]);
    });

    it("allows PyPI's file host only for the public PyPI", () => {
      const pin: ConnectorPin = { ...npmPin, registry: "pypi", registryUrl: "https://pypi.org" };
      const uvx: StdioConfig = { ...npx, command: "uvx", args: ["acme-notes"], pin };
      const sites = (registryUrl: string) =>
        localToolLaunch(uvx, pinnedPlace, { ...pin, registryUrl }, {}).profile.network.allowedSites;
      expect(sites("https://pypi.org")).toEqual([
        "notes.acme.test",
        "pypi.org",
        "files.pythonhosted.org",
      ]);
      expect(sites("https://pypi.acme.test")).toEqual(["notes.acme.test", "pypi.acme.test"]);
    });

    it("refuses a pin without the runner the host found for it", () => {
      expect(() => localToolLaunch(npx, testPlace, npmPin, {})).toThrow(
        "A pinned local tool needs the runner the host found for it.",
      );
    });
  });
});
