// The engine lock names the CLI command that holds it, so a command it
// refuses can say which one, and how to stop it (HAL-14299, C340 C46).

import { cp, mkdtemp, readdir, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { noKeyOrigins, runLockFormat } from "@halonicjs/ports";
import { type ProfileEnvironment, profileFolder } from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  type EngineHolder,
  engineLockFile,
  type LocalEngine,
  openLocalEngine,
} from "./local-engine-host.ts";
import { removeTestFolder } from "./test/remove-folder.ts";
import { nodeProfileEnvironment } from "./workspace-runs.ts";

const acmeExample = fileURLToPath(new URL("../../../examples/acme", import.meta.url));

let folder: string;
let acme: string;
let profile: ProfileEnvironment;
const opened: LocalEngine[] = [];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "halonic-cli-engine-holder-"));
  acme = join(folder, "acme");
  await cp(acmeExample, acme, { recursive: true });
  profile = { ...nodeProfileEnvironment(), variables: { HALONIC_HOME: join(folder, "profile") } };
});

afterEach(async () => {
  await Promise.all(opened.splice(0).map((engine) => engine.close()));
  await removeTestFolder(folder);
});

/** Opens an engine on the Acme example on the test model, held by `holder` when given. */
async function openEngine(holder?: EngineHolder): Promise<LocalEngine> {
  const engine = await openLocalEngine({
    workspace: await loadWorkspace(new FolderDefinitionStore(acme, "./acme")),
    workspaceRoot: acme,
    trusted: true,
    secrets: { get: async () => null },
    keyOrigins: noKeyOrigins,
    http: { fetch: () => Promise.reject(new TypeError("The test model calls no server.")) },
    environment: profile,
    reportError: () => {},
    ...(holder === undefined ? {} : { holder }),
  });
  opened.push(engine);
  return engine;
}

/** The engine lock of the Acme workspace, in its only folder in the profile. */
async function acmeEngineLock(): Promise<string> {
  const workspaces = join(profileFolder(profile).root, "workspaces");
  const [key] = await readdir(workspaces);
  return join(workspaces, key ?? "", engineLockFile);
}

verifies("cli.local-engine-lock", () => {
  it("names the command that holds the engine, and says how to stop one that runs until stopped", async () => {
    await openEngine("routinesWatch");

    await expect(openEngine("run")).rejects.toMatchObject({
      kind: "conflict",
      message: `halonic routines watch is running for this workspace (process ${process.pid}).`,
      fix: "Stop it with Ctrl C there, then run again.",
    });
  });

  it("names a run that holds the engine, which ends by itself, with the fix to wait", async () => {
    await openEngine("run");

    await expect(openEngine("serve")).rejects.toMatchObject({
      kind: "conflict",
      message: `halonic run is running for this workspace (process ${process.pid}).`,
      fix: "Wait until it has finished or stop it, then run again.",
    });
  });

  it("names no command when the lock names one that isn't the CLI's", async () => {
    await (await openEngine()).close();
    const held = {
      version: runLockFormat,
      pid: process.pid,
      host: hostname(),
      takenAt: new Date().toISOString(),
      holder: "something else",
    };
    await writeFile(await acmeEngineLock(), JSON.stringify(held), "utf8");

    await expect(openEngine()).rejects.toMatchObject({
      message: `Another Halonic engine is open on this workspace (process ${process.pid}).`,
    });
  });
});
