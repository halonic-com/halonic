import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DoctorWorkspace } from "@halonicjs/app";
import type { Provider } from "@halonicjs/format";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type DoctorMachine, doctorService, nodeDoctorMachine } from "./doctor-machine.ts";
import { noSecrets } from "./remembered-secrets.ts";

let profile: string;

beforeEach(() => {
  profile = mkdtempSync(join(tmpdir(), "halonic-cli-doctor-machine-"));
});

afterEach(() => {
  rmSync(profile, { recursive: true, force: true });
});

/** A computer whose probe gives every folder 100 bytes, and whose model server is LM Studio with qwen3 loaded. */
function machine(asked: string[] = []): DoctorMachine {
  return {
    profile: { platform: "linux", root: profile },
    trustStore: {
      get: async () => null,
      grant: async () => {},
      revoke: async () => {},
      list: async () => [],
    },
    sandbox: {
      check: async () => ({ ok: true, reason: null, missing: [] }),
      capabilities: () => ({ files: "shared", strength: "os" }),
    },
    sandboxKind: "bubblewrap",
    probe: {
      engineMemory: async () => 0,
      childProcesses: async () => [],
      folderSize: async (path) => {
        asked.push(path);
        return { bytes: 100, complete: true };
      },
      freeDisk: async () => 1024 ** 4,
    },
    harnesses: [],
    http: {
      fetch: async (url) => {
        asked.push(url);
        return new Response(JSON.stringify({ data: [{ id: "qwen3", state: "loaded" }] }));
      },
    },
    system: "Linux x64",
  };
}

describe("doctorService", () => {
  it("counts the runs, deployment runs and blobs of every workspace in the profile as run logs", async () => {
    mkdirSync(join(profile, "workspaces", "a1"), { recursive: true });
    mkdirSync(join(profile, "workspaces", "b2"), { recursive: true });
    writeFileSync(join(profile, "workspaces", "not-a-folder"), "");
    const asked: string[] = [];

    const report = await (await doctorService(machine(asked), noSecrets, null)).check(null);

    expect(asked.sort()).toEqual(
      ["a1", "b2"].flatMap((key) =>
        ["blobs", "deployments", "runs"].map((name) => join(profile, "workspaces", key, name)),
      ),
    );
    expect(report.disk.data).toEqual({ bytes: 600, runLogBytes: 600, complete: true });
  });

  it("counts nothing before the profile has any workspace", async () => {
    const report = await (await doctorService(machine(), noSecrets, null)).check(null);

    expect(report.disk.data).toEqual({ bytes: 0, runLogBytes: 0, complete: true });
  });

  it("asks each model server on this computer the workspace uses, at its default address", async () => {
    const lmStudio: Provider = {
      id: "studio",
      name: "LM Studio",
      type: "lmstudio",
      local: true,
    } as Provider;
    const workspace: DoctorWorkspace = {
      name: "Acme",
      trust: {
        location: "/work/acme",
        connectors: [],
        commandPaths: new Map(),
        agents: [],
        integrations: [],
        providers: [],
      },
      aliases: [{ alias: "fast", provider: "studio" }],
      providers: [
        {
          provider: "studio",
          name: "LM Studio",
          runs: "on-this-computer",
          address: "localhost:1234",
        },
      ],
    };
    const asked: string[] = [];

    const doctor = await doctorService(machine(asked), noSecrets, {
      workspace,
      providerFiles: new Map([["studio", lmStudio]]),
    });
    const report = await doctor.check(workspace);

    expect(asked).toContain("http://localhost:1234/api/v0/models");
    expect(report.models?.ready).toEqual([
      {
        provider: "studio",
        name: "LM Studio",
        answering: true,
        address: "localhost:1234",
        models: [{ name: "qwen3" }],
      },
    ]);
  });
});

describe("nodeDoctorMachine", () => {
  it("names this computer's system and its Claude Code and Codex harnesses", () => {
    const computer = nodeDoctorMachine();

    expect(computer.system).toMatch(/^(Linux|macOS|Windows|\w+) \w+$/);
    expect(computer.harnesses.map((harness) => harness.id)).toEqual(["claude-code", "codex"]);
  });
});
