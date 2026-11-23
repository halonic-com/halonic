import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import { webCryptoDigest } from "@halonicjs/adapter-workspace-engine-node";
import type { HarnessAgent } from "@halonicjs/engine";
import {
  type HarnessBridgeServer,
  noKeyOrigins,
  type Sandbox,
  type Secrets,
} from "@halonicjs/ports";
import {
  type ProfileEnvironment,
  profileFolder,
  type WorkspaceFolders,
  workspaceFolders,
} from "@halonicjs/profile";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  agentFilesOf,
  instructionTrustFolder,
  type LocalHarnessInput,
  openLocalHarnessHost,
  type RunFileVersions,
  skillTextOf,
} from "./local-harness-host.ts";

// The harness host's own wiring, on real folders with fake parts: the CLI's
// tests run it through the whole engine (`apps/cli/src/local-harness-host.test.ts`).

let folder: string;
let acme: string;
let environment: ProfileEnvironment;
let folders: WorkspaceFolders;
let workspace: LoadedWorkspace;
let reported: unknown[];

const coderFile = "hubs/lab/agents/coder.agent.yaml";
const coderText = "id: coder\nname: Coder\nharness: claude-code\ninstructions: Write the change.\n";
const toneFile = "library/skills/plain-tone/SKILL.md";
const toneText =
  "---\nname: plain-tone\ndescription: Short, plain sentences.\n---\nWrite plainly.\n";

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "nh-"));
  acme = join(folder, "acme");
  const files: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\ndescription: An invented shop.\n",
    "hubs/lab/hub.yaml": "id: lab\nname: Lab\ndescription: Where the coder changes a file.\n",
    [coderFile]: coderText,
    [toneFile]: toneText,
  };
  for (const [path, text] of Object.entries(files)) {
    await mkdir(dirname(join(acme, path)), { recursive: true });
    await writeFile(join(acme, path), text);
  }
  environment = {
    platform: "linux",
    homeFolder: folder,
    variables: { HALONIC_HOME: join(folder, "p") },
  };
  folders = await workspaceFolders(profileFolder(environment), acme, webCryptoDigest);
  workspace = await loadWorkspace(new FolderDefinitionStore(acme));
  reported = [];
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

const noSecrets: Secrets = { get: async () => null };

/** Opens nothing: a run would fail, and these tests start none. */
const noSandbox: Sandbox = {
  check: async () => ({ ok: true, reason: null, missing: [] }),
  capabilities: () => ({ files: "shared", strength: "os" }),
  open: async () => {
    throw new Error("The test opens no session.");
  },
};

const noBridge: HarnessBridgeServer = {
  open: async () => {
    throw new Error("The test opens no bridge.");
  },
};

function inputFor(openRuns: () => Promise<ReadonlySet<string>>): LocalHarnessInput {
  return {
    halonicVersion: "0.0.0-test",
    location: acme,
    folders,
    profile: profileFolder(environment),
    environment,
    workspace: () => workspace,
    store: new FolderDefinitionStore(acme),
    digest: webCryptoDigest,
    clock: { now: () => new Date("2026-11-23T09:00:00.000Z") },
    openRuns,
    reportError: (error) => reported.push(error),
    reportBridgeError: (error) => reported.push(error),
    reportHostLock: (error) => reported.push(error),
    secrets: noSecrets,
    keyOrigins: noKeyOrigins,
    trusted: false,
    parts: {
      fenced: noSandbox,
      launcher: noSandbox,
      harnesses: {},
      bridgeServer: noBridge,
      platform: "linux",
      programEnvironment: {},
    },
  };
}

verifies("cli.local-harness-host", () => {
  it("empties what a stopped engine left in the temp folder, and asks for no runs when nothing is kept", async () => {
    const left = join(folders.harnessTempFolder(), "old-session");
    await mkdir(left, { recursive: true });
    let asked = 0;

    const host = await openLocalHarnessHost(
      inputFor(async () => {
        asked += 1;
        return new Set();
      }),
    );
    await host.start();
    await host.close();

    expect(existsSync(left)).toBe(false);
    expect(await readdir(folders.harnessTempFolder())).toEqual([]);
    expect(asked).toBe(0);
    expect(reported).toEqual([]);
  });

  it("asks for the open runs when a proposal is kept, and reports a failure instead of throwing", async () => {
    const unreadable = new Error("The run log can't be read.");
    const host = await openLocalHarnessHost(
      inputFor(async () => {
        throw unreadable;
      }),
    );
    // A record of a run that ended while no engine was open.
    await writeFile(join(folders.proposalRecordsFolder(), "run-1.json"), "{}");

    await host.start();
    await host.close();

    expect(reported).toEqual([unreadable]);
  });

  it("keeps the trusted instructions in the profile, never in the workspace", () => {
    const profile = profileFolder(environment);
    expect(instructionTrustFolder(profile)).toBe(join(profile.root, "instruction-trust"));
  });
});

verifies("cli.local-harness-host", () => {
  const coder = { hubId: "lab", runId: "run-1", version: null } as unknown as HarnessAgent;

  it("reads an agent's file and a skill's text from disk when the run gave no version", async () => {
    const input = { workspace: () => workspace, location: acme };

    const bytes = await agentFilesOf(input).bytesOf("lab", "coder", {
      runId: "run-1",
      version: null,
    });

    expect(new TextDecoder().decode(bytes)).toBe(coderText);
    expect(await skillTextOf(input)(coder, "plain-tone")).toBe(toneText);
  });

  it("refuses an agent or a skill the workspace doesn't have", async () => {
    const input = { workspace: () => workspace, location: acme };

    await expect(
      agentFilesOf(input).bytesOf("lab", "nobody", { runId: "run-1", version: null }),
    ).rejects.toThrow('Hub "lab" has no agent "nobody".');
    await expect(skillTextOf(input)(coder, "missing")).rejects.toThrow(
      'The workspace has no skill "missing".',
    );
  });

  it("reads both from the run's version when the command gave one, never from disk", async () => {
    const versions: RunFileVersions = {
      agentFileOf: async (_run, hubId, agentId) => new TextEncoder().encode(`${hubId}/${agentId}`),
      skillTextOf: async (_run, hubId, skillId) => `${hubId}/${skillId}`,
    };
    const input = { workspace: () => workspace, location: acme, runFiles: versions };

    const bytes = await agentFilesOf(input).bytesOf("lab", "coder", {
      runId: "run-1",
      version: null,
    });

    expect(new TextDecoder().decode(bytes)).toBe("lab/coder");
    expect(await skillTextOf(input)(coder, "plain-tone")).toBe("lab/plain-tone");
  });
});
