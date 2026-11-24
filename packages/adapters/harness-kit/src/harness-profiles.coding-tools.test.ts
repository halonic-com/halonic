import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodingToolsServer } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writerAgent } from "./harness-agent.test-helper.ts";
import { HarnessProfiles } from "./harness-profiles.ts";

const bridge = { url: "http://127.0.0.1:41817", token: "run-token" };

let top: string;
let home: string;
let workspace: string;
let data: string;

beforeEach(async () => {
  top = await realpath(await mkdtemp(join(tmpdir(), "harness-profile-tools-")));
  home = join(top, "home");
  workspace = join(home, "work", "acme");
  data = join(top, "data");
  const folders = [
    join(top, "opt", "halonic"),
    join(home, ".claude", "local"),
    join(workspace, "agents"),
    join(data, "tmp", "run_1"),
    join(data, "settings", "writer"),
  ];
  for (const folder of folders) await mkdir(folder, { recursive: true });
});

afterEach(async () => {
  await rm(top, { recursive: true, force: true });
});

function serverAt(...codePaths: string[]): CodingToolsServer {
  return { program: join(top, "opt", "halonic", "node"), args: ["coding-tools"], codePaths };
}

async function profileWith(codingTools: CodingToolsServer) {
  const profiles = new HarnessProfiles({
    workspace,
    halonicData: data,
    home,
    host: {
      agentFile: async () => ({
        workingFolder: null,
        allowedSites: [],
        install: { program: "claude", packageFolder: null },
      }),
      tempFolder: async () => join(data, "tmp", "run_1"),
      settingsFolder: async () => join(data, "settings", "writer"),
    },
    env: {},
    timeLimitMs: 600_000,
    platform: "linux",
    codingTools,
  });
  return await profiles.profileOf(writerAgent(null), bridge, null);
}

verifies("harness-kit.coding-tools-server", () => {
  describe("HarnessProfiles: coding tools server", () => {
    it("opens the server's code read-only and names the server when nothing writable holds it", async () => {
      const server = serverAt(join(top, "opt", "halonic"));

      const { profile, codingTools } = await profileWith(server);

      expect(codingTools).toEqual(server);
      expect(profile.readOnlyPaths).toContain(join(top, "opt", "halonic"));
    });

    it.each([
      ["the workspace, which holds the working folder", () => workspace],
      ["the working folder", () => join(workspace, "files", "agents", "writer", "tools")],
      ["the temp folder", () => join(data, "tmp", "run_1", "tools")],
      ["the settings folder", () => join(data, "settings", "writer")],
    ])("names no server whose code is in %s", async (_name, codePath) => {
      const { profile, codingTools } = await profileWith(
        serverAt(join(top, "opt", "halonic"), codePath()),
      );

      expect(codingTools).toBeUndefined();
      expect(profile.readOnlyPaths).not.toContain(join(top, "opt", "halonic"));
    });

    it("names no server whose code the profile denies", async () => {
      const { codingTools } = await profileWith(serverAt(join(home, ".claude", "local")));

      expect(codingTools).toBeUndefined();
    });
  });
});
