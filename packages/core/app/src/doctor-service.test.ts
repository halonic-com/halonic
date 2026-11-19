import type { Agent } from "@halonicjs/format";
import type { HarnessDetection, SandboxCheck, Secrets } from "@halonicjs/ports";
import { err, ok } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { NodeProblem } from "./doctor-lines.ts";
import { type DoctorProvider, DoctorService, type DoctorWorkspace } from "./doctor-service.ts";
import type { DoctorHarness } from "./doctor-sign-ins.ts";
import { doctorCheckLimitMs } from "./doctor-time-limit.ts";
import type { ProviderModels, Resources } from "./resource-report.ts";
import type { SandboxBackendStatus, SandboxChoice } from "./sandbox-choice.ts";
import { HandTimers } from "./testing/hand-timers.ts";
import type { TrustCheck } from "./trust-service.ts";

const ready: SandboxCheck = { ok: true, reason: null, missing: [] };
const llama = { name: "llama3.2", memoryBytes: 2_000_000_000 };

const ollama: DoctorProvider = {
  provider: "ollama",
  name: "Ollama",
  runs: "on-this-computer",
  address: "localhost:11434",
};
const anthropic: DoctorProvider = {
  provider: "anthropic",
  name: "Anthropic",
  runs: "with-a-key",
  secret: "ANTHROPIC_API_KEY",
};

/** An agent of the workspace, in Halonic's own loop unless a harness is given. */
function agent(name: string, harness?: Agent["harness"]): Agent {
  return {
    version: 1,
    id: name.toLowerCase(),
    name,
    params: {},
    instructions: "",
    skills: [],
    knowledge: [],
    connectors: [],
    runLogs: false,
    collections: [],
    subagents: [],
    methods: {},
    output: { type: "text" },
    maxSteps: 6,
    ...(harness === undefined ? {} : { harness, allowedSites: [] }),
  };
}

function workspace(parts: Partial<DoctorWorkspace> & { agents?: Agent[] } = {}): DoctorWorkspace {
  return {
    name: "acme",
    trust: {
      location: "/work/acme",
      connectors: [],
      commandPaths: new Map(),
      agents: parts.agents ?? [],
      integrations: [],
      providers: [],
    },
    aliases: parts.aliases ?? [],
    providers: parts.providers ?? [],
    ...(parts.testModelOnly === undefined ? {} : { testModelOnly: parts.testModelOnly }),
    ...(parts.windowsDrive === undefined ? {} : { windowsDrive: parts.windowsDrive }),
  };
}

interface Machine {
  trust?: TrustCheck["status"];
  sandbox?: SandboxCheck;
  freeBytes?: number;
  models?: ProviderModels[];
  codex?: HarnessDetection;
  /** Codex as a whole, in place of one that only answers `codex`. */
  codexHarness?: DoctorHarness;
  /** The sandbox choice; the host has none when left out. */
  choice?: SandboxChoice | null;
  secrets?: Record<string, string>;
  /** What the host found wrong with Node.js; the host checks nothing when left out. */
  node?: NodeProblem | null;
  /** The sandbox check as a whole, in place of one that answers `sandbox`. */
  sandboxCheck?: () => Promise<SandboxCheck>;
  /** The resource report's read, in place of one that answers at once. */
  read?: () => Promise<Resources>;
}

/** A check that never answers. */
const never = <T>(): Promise<T> => new Promise<T>(() => undefined);

/** A doctor on a machine with plenty of disk and a working sandbox, unless told otherwise. */
function doctor(machine: Machine = {}) {
  const asked: string[] = [];
  const resources: Resources = {
    at: "2026-11-10T09:00:00.000Z",
    memory: ok({ engineBytes: 0, processes: [], totalBytes: 0 }),
    data: [],
    disk: ok({
      freeBytes: machine.freeBytes ?? 50e9,
      low: (machine.freeBytes ?? 50e9) < 1024 ** 3,
    }),
    models: machine.models ?? [],
    waits: ok([]),
  };
  const secrets: Secrets = {
    get: async (name) => {
      asked.push(name);
      return machine.secrets?.[name] ?? null;
    },
  };
  const timers = new HandTimers();
  const service = new DoctorService({
    trust: { check: async () => ({ status: machine.trust ?? "trusted" }) },
    sandbox: {
      check: machine.sandboxCheck ?? (async () => machine.sandbox ?? ready),
      capabilities: () => ({ files: "shared", strength: "os" }),
    },
    resources: { read: machine.read ?? (async () => resources) },
    harnesses: [
      machine.codexHarness ?? {
        id: "codex",
        name: "Codex",
        detect: async () => machine.codex ?? { status: "missing" },
      },
    ],
    secrets,
    ...(machine.choice === undefined
      ? {}
      : { sandboxChoice: { current: () => machine.choice ?? null } }),
    ...(machine.node === undefined ? {} : { node: async () => machine.node ?? null }),
    timers,
  });
  return { service, asked, timers };
}

/**
 * The report of `doctor`, with the time limit reached once the checks that
 * answer have: the timers still set then are those of the checks that hang.
 */
async function afterLimit(
  { service, timers }: ReturnType<typeof doctor>,
  workspace: DoctorWorkspace | null,
) {
  const checking = service.check(workspace);
  await new Promise((resolve) => setImmediate(resolve));
  timers.fire();
  return checking;
}

verifies("app.doctor-service", () => {
  it("shows only the Sandbox and Disk lines outside a workspace, and exits 0 when they're fine", async () => {
    const report = await doctor().service.check(null);

    expect(report).toEqual({
      sandbox: {
        check: "sandbox",
        status: "ok",
        capabilities: { files: "shared", strength: "os" },
      },
      disk: {
        check: "disk",
        status: "ok",
        freeBytes: 50e9,
        data: { bytes: 0, runLogBytes: 0, complete: true },
        problem: null,
      },
      summary: { problems: 0, warnings: 0, needsFixing: false },
    });
  });

  it("adds the Workspace line inside a workspace, marked by its trust", async () => {
    const report = await doctor({ trust: "changed" }).service.check(workspace());

    expect(report.workspace).toEqual({
      check: "workspace",
      status: "warning",
      name: "acme",
      trust: "changed",
    });
    expect(report.models).toBeUndefined();
    expect(report.summary).toEqual({ problems: 0, warnings: 1, needsFixing: false });
  });

  it("doesn't read the trust check for a workspace on the test model only, and marks it ok", async () => {
    const report = await doctor({ trust: "new" }).service.check(workspace({ testModelOnly: true }));

    expect(report.workspace).toEqual({
      check: "workspace",
      status: "ok",
      name: "acme",
      trust: "not-needed",
    });
    expect(report.summary.warnings).toBe(0);
  });

  it("reads each provider's models from the report and each key from the secrets", async () => {
    const { service, asked } = doctor({
      models: [{ provider: "ollama", models: ok([llama]) }],
      secrets: { ANTHROPIC_API_KEY: "stored" },
    });

    const report = await service.check(
      workspace({
        aliases: [
          { alias: "fast", provider: "ollama" },
          { alias: "smart", provider: "anthropic" },
        ],
        providers: [ollama, anthropic],
      }),
    );

    expect(report.models).toEqual({
      check: "models",
      status: "ok",
      ready: [
        {
          provider: "ollama",
          name: "Ollama",
          answering: true,
          address: "localhost:11434",
          models: [llama],
        },
        { provider: "anthropic", name: "Anthropic", keyStored: true },
      ],
      problems: [],
    });
    expect(asked).toEqual(["ANTHROPIC_API_KEY"]);
  });

  it("exits 1 when a provider on this computer doesn't answer", async () => {
    const report = await doctor({
      models: [{ provider: "ollama", models: err(new Error("ECONNREFUSED")) }],
    }).service.check(
      workspace({ aliases: [{ alias: "fast", provider: "ollama" }], providers: [ollama] }),
    );

    expect(report.models?.status).toBe("failed");
    expect(report.summary.needsFixing).toBe(true);
  });

  it("warns about an alias whose key isn't stored, and never names a provider that needs none", async () => {
    const mock: DoctorProvider = { provider: "mock", name: "Mock", runs: "without-a-key" };

    const report = await doctor().service.check(
      workspace({
        aliases: [
          { alias: "smart", provider: "anthropic" },
          { alias: "test", provider: "mock" },
        ],
        providers: [anthropic, mock],
      }),
    );

    expect(report.models).toMatchObject({
      ready: [],
      problems: [{ problem: "no-key", alias: "smart", provider: "anthropic", name: "Anthropic" }],
    });
  });

  it("warns about an agent whose harness isn't installed, and not about one in Halonic's own loop", async () => {
    const report = await doctor().service.check(
      workspace({
        agents: [agent("Writer", "codex"), agent("Planner"), agent("Helper", "halonic")],
      }),
    );

    expect(report.harnesses).toEqual({
      check: "harnesses",
      status: "warning",
      installed: [],
      problems: [{ problem: "missing", agent: "Writer", harness: "codex", name: "Codex" }],
    });
    expect(report.summary).toEqual({ problems: 0, warnings: 1, needsFixing: false });
  });

  it("names an agent that isn't signed in in the settings folder the host gives it", async () => {
    const { service } = doctor({
      codexHarness: {
        id: "codex",
        name: "Codex",
        signIn: { program: "codex", args: ["login"], folderVariable: "CODEX_HOME" },
        // The person is signed in in their own folder, and only Reviewer in its own.
        detect: async (options) =>
          [undefined, "/data/reviewer/codex"].includes(options?.settingsFolder)
            ? { status: "ready", version: "0.9.2" }
            : { status: "signed-out", version: "0.9.2" },
      },
    });
    const folders = (agentId: string, harnessId: string) =>
      agentId === "odd" ? undefined : `/data/${agentId}/${harnessId}`;
    const agents = [agent("Writer", "codex"), agent("Reviewer", "codex"), agent("Odd", "codex")];

    const report = await service.check({
      ...workspace({ agents }),
      harnessSettingsFolder: folders,
    });
    const without = await service.check(workspace({ agents }));

    expect(report.harnesses).toMatchObject({
      status: "warning",
      problems: [
        expect.objectContaining({
          problem: "signed-out",
          agent: "Writer",
          settingsFolder: "/data/writer/codex",
        }),
      ],
    });
    expect(without.harnesses).toMatchObject({ problems: [] });
  });

  it("lists a ready harness outside a workspace, and has no Harnesses line when none is ready or used", async () => {
    const installed = await doctor({ codex: { status: "ready", version: "0.9.2" } }).service.check(
      null,
    );
    const none = await doctor().service.check(null);

    expect(installed.harnesses).toMatchObject({
      installed: [{ harness: "codex", name: "Codex", version: "0.9.2" }],
    });
    expect(none.harnesses).toBeUndefined();
  });

  it("counts a sandbox that can't start and low disk space in the summary", async () => {
    const report = await doctor({
      sandbox: { ok: false, reason: "bubblewrap-missing", missing: ["bwrap not found"] },
      freeBytes: 800_000_000,
    }).service.check(null);

    expect(report.sandbox.status).toBe("failed");
    expect(report.disk).toMatchObject({ problem: "low" });
    expect(report.summary).toEqual({ problems: 1, warnings: 1, needsFixing: true });
  });

  it("adds the MXC line where MXC is offered, and counts a failed trust check in the summary", async () => {
    const mxc: SandboxBackendStatus = {
      id: "mxc",
      offered: true,
      state: "check-failed",
      reason: "too-strict",
      setup: null,
      missing: ["the read-only file couldn't be read"],
      limits: [],
      residuals: [],
    };
    const failed: SandboxChoice = {
      active: null,
      setting: { backend: "mxc", chosenAt: "2026-11-14T09:00:00.000Z" },
      backends: [mxc],
    };
    const report = await doctor({ choice: failed }).service.check(null);
    expect(report.mxc).toMatchObject({ check: "mxc", status: "failed", reason: "too-strict" });
    expect(report.summary).toEqual({ problems: 1, warnings: 0, needsFixing: true });

    const notOffered: SandboxChoice = {
      active: "srt",
      setting: null,
      backends: [{ ...mxc, offered: false, state: "not-available", reason: null, missing: [] }],
    };
    expect((await doctor({ choice: notOffered }).service.check(null)).mxc).toBeUndefined();
    expect((await doctor({ choice: null }).service.check(null)).mxc).toBeUndefined();
  });

  it("throws when a provider on this computer has no source in the resource report", async () => {
    const check = doctor().service.check(
      workspace({ aliases: [{ alias: "fast", provider: "ollama" }], providers: [ollama] }),
    );

    await expect(check).rejects.toThrow(
      "The provider ollama runs on this computer, but the resource report has no LoadedModelSource for it.",
    );
  });
});

verifies("app.doctor-workspace-drive", () => {
  it("warns on the Workspace line when the host found the workspace on a Windows drive", async () => {
    const report = await doctor({ trust: "trusted" }).service.check(
      workspace({ windowsDrive: "/mnt/c" }),
    );

    expect(report.workspace).toEqual({
      check: "workspace",
      status: "warning",
      name: "acme",
      trust: "trusted",
      windowsDrive: "/mnt/c",
    });
    expect(report.summary).toEqual({ problems: 0, warnings: 1, needsFixing: false });
  });
});

verifies("app.doctor-node", () => {
  it("warns on a Node.js line when the host found Windows' Node.js in a WSL folder", async () => {
    const report = await doctor({ node: { problem: "windows-node-in-wsl" } }).service.check(null);

    expect(report.node).toEqual({
      check: "node",
      status: "warning",
      problem: "windows-node-in-wsl",
    });
    expect(report.summary).toEqual({ problems: 0, warnings: 1, needsFixing: false });
  });

  it("names Windows' pnpm when the host found it on the PATH inside WSL", async () => {
    const pnpm = "/mnt/c/nodejs/pnpm"; // leak-guard: allow absolute-path an example WSL drive
    const report = await doctor({ node: { problem: "windows-pnpm", pnpm } }).service.check(null);

    expect(report.node).toEqual({
      check: "node",
      status: "warning",
      problem: "windows-pnpm",
      pnpm,
    });
  });

  it("has no Node.js line when the host found nothing, or checks nothing", async () => {
    expect((await doctor({ node: null }).service.check(null)).node).toBeUndefined();
    expect((await doctor().service.check(null)).node).toBeUndefined();
  });
});

verifies("app.doctor-time-limit", () => {
  it("warns on a harness whose detect() never answers, and still gives the other lines", async () => {
    const report = await afterLimit(
      doctor({ codexHarness: { id: "codex", name: "Codex", detect: never } }),
      null,
    );

    expect(report.harnesses).toEqual({ check: "harnesses", status: "warning", timedOut: true });
    expect(report.sandbox.status).toBe("ok");
    expect(report.disk.status).toBe("ok");
    expect(report.summary).toEqual({ problems: 0, warnings: 1, needsFixing: false });
  });

  it("gives each check 5 seconds, and clears every timer of a check that answers", async () => {
    const machine = doctor({ sandboxCheck: never });
    const checking = machine.service.check(null);

    expect(machine.timers.delays()).toEqual(Array(6).fill(doctorCheckLimitMs));
    expect(doctorCheckLimitMs).toBe(5_000);
    await new Promise((resolve) => setImmediate(resolve));
    expect(machine.timers.delays()).toEqual([doctorCheckLimitMs]);
    machine.timers.fire();
    const report = await checking;

    expect(report.sandbox).toEqual({ check: "sandbox", status: "warning", timedOut: true });
    expect(report.summary).toEqual({ problems: 0, warnings: 1, needsFixing: false });
  });

  it("times out the Disk line, but not the Models line of providers off this computer, when the resource report hangs", async () => {
    const report = await afterLimit(
      doctor({ read: never, secrets: { ANTHROPIC_API_KEY: "sk-test" } }),
      workspace({
        providers: [anthropic],
        aliases: [{ alias: "smart", provider: "anthropic" }],
      }),
    );

    expect(report.disk).toEqual({ check: "disk", status: "warning", timedOut: true });
    expect(report.models?.status).toBe("ok");
  });

  it("times out the Models line too when a provider runs on this computer", async () => {
    const report = await afterLimit(
      doctor({ read: never }),
      workspace({ providers: [ollama], aliases: [{ alias: "fast", provider: "ollama" }] }),
    );

    expect(report.models).toEqual({ check: "models", status: "warning", timedOut: true });
    expect(report.workspace?.status).toBe("ok");
  });

  it("still throws what a check throws in time", async () => {
    const report = doctor({
      sandboxCheck: () => Promise.reject(new Error("broken")),
    }).service.check(null);

    await expect(report).rejects.toThrow("broken");
  });
});
