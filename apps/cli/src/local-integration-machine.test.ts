import { mkdir, mkdtemp, readdir, realpath, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { nodeProgramStarter } from "@halonicjs/adapter-mcp";
import { MemoryTrustStore } from "@halonicjs/adapter-memory";
import { type ProfileEnvironment, profileFolder, runnerTempFolder } from "@halonicjs/profile";
import { fixedClock } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cliConnectorFactories } from "./connector-machine.ts";
import { IntegrationConnectorFactory } from "./integration-connector-factory.ts";
import { computerIntegrationMachine } from "./local-integration-machine.ts";
import { removeTestFolder } from "./test/remove-folder.ts";
import type { OpenWorkspaceDir } from "./workspace-dir.ts";
import { profilePlatformOf } from "./workspace-runs.ts";

let base: string;
let dir: OpenWorkspaceDir;

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), "halonic-cli-integration-machine-")));
  const root = join(base, "acme");
  await mkdir(join(root, "integrations", "notes"), { recursive: true });
  await writeFile(join(root, "integrations", "notes", "integration.yaml"), "id: notes\n");
  const store = new FolderDefinitionStore(root, "./acme");
  dir = { root, shown: "./acme", name: "acme", store };
});

afterEach(async () => {
  await removeTestFolder(base);
});

const environment = (): ProfileEnvironment => ({
  platform: profilePlatformOf(process.platform),
  homeFolder: join(base, "home"),
  variables: { HALONIC_HOME: join(base, "profile") },
});

async function machine() {
  return computerIntegrationMachine({
    dir,
    workspace: await loadWorkspace(dir.store),
    trust: {
      trustStore: new MemoryTrustStore(),
      clock: fixedClock(Date.UTC(2026, 10, 13)),
      commandSearch: { path: undefined, endings: [] },
    },
    environment: environment(),
  });
}

verifies("cli.open-local-integration", () => {
  describe("computerIntegrationMachine", () => {
    it("makes a fresh private temp folder in the profile for every start, and removes them on dispose", async () => {
      const computer = await machine();
      const first = await computer.runnerMachine();
      const second = await computer.runnerMachine();
      expect(first.tempFolder).not.toBe(second.tempFolder);
      const parent = runnerTempFolder(profileFolder(environment()));
      expect(first.tempFolder.startsWith(await realpath(parent))).toBe(true);
      expect(await readdir(parent)).toHaveLength(2);
      await computer.dispose();
      await computer.dispose();
      expect(await readdir(parent)).toHaveLength(0);
    });

    it("gives the runner the folder holding Node and nothing above it", async () => {
      const computer = await machine();
      expect(computer.runtime.nodeFolder).toBe(dirname(process.execPath));
      await computer.dispose();
    });

    it("lets the integration's requests reach this computer, which the sheet then limits", async () => {
      const server = createServer((_request, response) => response.end("ok"));
      await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
      try {
        const { port } = server.address() as AddressInfo;
        const computer = await machine();
        const response = await computer.transport.fetch(`http://localhost:${port}/`);
        expect(await response.text()).toBe("ok");
        await computer.dispose();
      } finally {
        await new Promise((done) => server.close(done));
      }
    });

    it("hides the person's home folder and gives the runner no network", async () => {
      const computer = await machine();
      const started = await computer.runnerMachine();
      expect(started.homeFolder).not.toBe("");
      expect(started.timeLimitMs).toBeGreaterThan(0);
      await computer.dispose();
    });

    it("asks the trust check again at every start: a workspace never trusted is not trusted", async () => {
      const computer = await machine();
      const first = await computer.trustCheck({} as never);
      const second = await computer.trustCheck({} as never);
      expect(first.status).toBe("new");
      expect(second.status).toBe("new");
    });
  });

  describe("cliConnectorFactories", () => {
    it("serves the integration transport only when it is given a way to open one", () => {
      expect(cliConnectorFactories(nodeProgramStarter, {}).serves("integration")).toBe(false);
      const opened = cliConnectorFactories(nodeProgramStarter, {}, undefined, async () => {
        throw new Error("not opened");
      });
      expect(opened.serves("integration")).toBe(true);
      expect(IntegrationConnectorFactory).toBeDefined();
    });
  });
});
