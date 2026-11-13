import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConnectorPin } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localToolLaunch, type StdioConfig } from "./local-tool-launch.ts";
import {
  refuseAgentFolderStart,
  type WorkspaceConnectorSetting,
  workspaceConnectorPlace,
  workspaceStartFolder,
} from "./workspace-connector-place.ts";

const setting: WorkspaceConnectorSetting = {
  workingFolder: "/halonic/connectors/mail",
  tempFolder: "/halonic/tmp/mail",
  workspaceRoot: "/w",
  agentWorkingFolders: ["/w/files/agents/writer", "/w/files/agents/editor"],
  deniedPaths: ["/halonic/data"],
  bridge: null,
  timeLimitMs: 60_000,
  path: "/usr/bin",
};

const script: StdioConfig = {
  kind: "stdio",
  command: "node",
  args: ["tools/mail.js"],
  env: { MAIL_MODE: "quiet" },
  sites: ["mail.acme.test"],
};

const pin: ConnectorPin = {
  registry: "npm",
  registryUrl: "https://registry.npmjs.org",
  package: "@acme/mail-mcp",
  version: "1.2.3",
};

verifies("connector-stdio-sandbox.workspace-connector-profile", () => {
  describe("workspaceConnectorPlace", () => {
    it("lets a script read the workspace, denies every agent's working folder and allows only its sites", () => {
      const { profile } = localToolLaunch(script, workspaceConnectorPlace(script, setting), null, {
        MAIL_TOKEN: "token-value",
      });
      expect(profile.workingFolder).toBe("/halonic/connectors/mail");
      expect(profile.readOnlyPaths).toEqual(["/w"]);
      expect(profile.deniedPaths).toEqual([
        "/halonic/data",
        "/w/files/agents/writer",
        "/w/files/agents/editor",
      ]);
      expect(profile.network).toEqual({ bridge: null, allowedSites: ["mail.acme.test"] });
      expect(profile.env).toMatchObject({ MAIL_MODE: "quiet", MAIL_TOKEN: "token-value" });
    });

    it("gives a connector without sites, or with an empty list, no network but the bridge", () => {
      const { sites: _sites, ...noSites } = script;
      for (const stdio of [noSites, { ...script, sites: [] }]) {
        const place = workspaceConnectorPlace(stdio, {
          ...setting,
          bridge: { kind: "loopback", host: "127.0.0.1", port: 7 },
        });
        expect(place.sites).toEqual([]);
        expect(place.bridge).toEqual({ kind: "loopback", host: "127.0.0.1", port: 7 });
      }
    });

    it("doesn't let a pinned package read the workspace, and starts it in its own folder", () => {
      const pinned: StdioConfig = { ...script, command: "npx", args: ["@acme/mail-mcp"], pin };
      expect(workspaceConnectorPlace(pinned, setting).readOnlyPaths).toEqual([]);
      expect(workspaceStartFolder(pinned, setting)).toBe("/halonic/connectors/mail");
    });

    it("starts a script in the workspace, or in the file's cwd there", () => {
      expect(workspaceStartFolder(script, setting)).toBe("/w");
      expect(workspaceStartFolder({ ...script, cwd: "tools" }, setting)).toBe("/w/tools");
    });
  });
});

verifies("connector-stdio-sandbox.workspace-connector-start-check", () => {
  describe("refuseAgentFolderStart", () => {
    let workspace: string;
    let checked: WorkspaceConnectorSetting;

    beforeEach(async () => {
      workspace = await realpath(await mkdtemp(join(tmpdir(), "connector-stdio-sandbox-")));
      const writer = join(workspace, "files", "agents", "writer");
      await mkdir(writer, { recursive: true });
      await mkdir(join(workspace, "tools"));
      await writeFile(join(writer, "server.js"), "");
      await writeFile(join(workspace, "tools", "mail.js"), "");
      checked = { ...setting, workspaceRoot: workspace, agentWorkingFolders: [writer] };
    });

    afterEach(async () => {
      await rm(workspace, { recursive: true, force: true });
    });

    it("lets a script outside every working folder start", async () => {
      await expect(refuseAgentFolderStart(script, workspace, checked)).resolves.toBeUndefined();
    });

    it("refuses a script in an agent's working folder, naming the folder", async () => {
      const agentScript = { ...script, args: ["files/agents/writer/server.js"] };
      await expect(refuseAgentFolderStart(agentScript, workspace, checked)).rejects.toThrow(
        /agent working folder/,
      );
    });

    it("refuses an env value that names an agent's working folder", async () => {
      const agentEnv = { ...script, env: { NODE_PATH: join(workspace, "files/agents/writer") } };
      await expect(refuseAgentFolderStart(agentEnv, workspace, checked)).rejects.toThrow(
        /agent working folder/,
      );
    });

    it.skipIf(process.platform === "win32")(
      "refuses a program found on the PATH in an agent's working folder",
      async () => {
        const writer = join(workspace, "files", "agents", "writer");
        await writeFile(join(writer, "mail-mcp"), "#!/bin/sh\n");
        await chmod(join(writer, "mail-mcp"), 0o755);
        const onPath = { ...script, command: "mail-mcp", args: [] };
        await expect(
          refuseAgentFolderStart(onPath, workspace, { ...checked, path: writer }),
        ).rejects.toThrow(/agent working folder/);
      },
    );
  });
});
