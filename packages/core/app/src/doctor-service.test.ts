import type { Agent } from "@halonicjs/format";
import type { HarnessDetection, SandboxCheck, Secrets } from "@halonicjs/ports";
import { err, ok } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type DoctorProvider, DoctorService, type DoctorWorkspace } from "./doctor-service.ts";
import type { ProviderModels, Resources } from "./resource-report.ts";
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
    },
    aliases: parts.aliases ?? [],
    providers: parts.providers ?? [],
  };
}

interface Machine {
  trust?: TrustCheck["status"];
  sandbox?: SandboxCheck;
  freeBytes?: number;
  models?: ProviderModels[];
  codex?: HarnessDetection;
  secrets?: Record<string, string>;
}

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
  const service = new DoctorService({
    trust: { check: async () => ({ status: machine.trust ?? "trusted" }) },
    sandbox: {
      check: async () => machine.sandbox ?? ready,
      capabilities: () => ({ files: "shared", strength: "os" }),
    },
    resources: { read: async () => resources },
    harnesses: [
      { id: "codex", name: "Codex", detect: async () => machine.codex ?? { status: "missing" } },
    ],
    secrets,
  });
  return { service, asked };
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

    expect(report.models?.ready).toEqual([]);
    expect(report.models?.problems).toEqual([
      { problem: "no-key", alias: "smart", provider: "anthropic", name: "Anthropic" },
    ]);
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

  it("lists a ready harness outside a workspace, and has no Harnesses line when none is ready or used", async () => {
    const installed = await doctor({ codex: { status: "ready", version: "0.9.2" } }).service.check(
      null,
    );
    const none = await doctor().service.check(null);

    expect(installed.harnesses?.installed).toEqual([
      { harness: "codex", name: "Codex", version: "0.9.2" },
    ]);
    expect(none.harnesses).toBeUndefined();
  });

  it("counts a sandbox that can't start and low disk space in the summary", async () => {
    const report = await doctor({
      sandbox: { ok: false, reason: "bubblewrap-missing", missing: ["bwrap not found"] },
      freeBytes: 800_000_000,
    }).service.check(null);

    expect(report.sandbox.status).toBe("failed");
    expect(report.disk.problem).toBe("low");
    expect(report.summary).toEqual({ problems: 1, warnings: 1, needsFixing: true });
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
