import { err, ok } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { DoctorProvider } from "./doctor-service.ts";
import type { SandboxBackendStatus, SandboxChoice } from "./sandbox-choice.ts";
import {
  agent,
  answered,
  anthropic,
  doctor,
  llama,
  ollama,
  workspace,
} from "./testing/doctor-fixtures.ts";

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

    expect(answered(report.models).ready).toEqual([]);
    expect(answered(report.models).problems).toEqual([
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

    expect(report.harnesses?.status).toBe("warning");
    expect(answered(report.harnesses).problems).toEqual([
      expect.objectContaining({
        problem: "signed-out",
        agent: "Writer",
        settingsFolder: "/data/writer/codex",
      }),
    ]);
    expect(answered(without.harnesses).problems).toEqual([]);
  });

  it("lists a ready harness outside a workspace, and has no Harnesses line when none is ready or used", async () => {
    const installed = await doctor({ codex: { status: "ready", version: "0.9.2" } }).service.check(
      null,
    );
    const none = await doctor().service.check(null);

    expect(answered(installed.harnesses).installed).toEqual([
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
    expect(answered(report.disk).problem).toBe("low");
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

verifies("app.doctor-workspace-watch", () => {
  it("warns on the Workspace line when the host found more files than Studio watches", async () => {
    const report = await doctor({ trust: "trusted" }).service.check(
      workspace({ tooManyFilesToWatch: 50_000 }),
    );

    expect(report.workspace).toEqual({
      check: "workspace",
      status: "warning",
      name: "acme",
      trust: "trusted",
      tooManyFilesToWatch: 50_000,
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

verifies("app.doctor-network", () => {
  it("warns on a Network line when the proxy isn't an http:// one, naming its variable", async () => {
    const network = {
      problem: "proxy-not-http",
      variable: "HTTPS_PROXY",
      scheme: "https",
    } as const;
    const report = await doctor({ network }).service.check(null);

    expect(report.network).toEqual({ check: "network", status: "warning", ...network });
    expect(report.summary).toEqual({ problems: 0, warnings: 1, needsFixing: false });
  });

  it("has no Network line when the host found nothing, or checks nothing", async () => {
    expect((await doctor({ network: null }).service.check(null)).network).toBeUndefined();
    expect((await doctor().service.check(null)).network).toBeUndefined();
  });
});

verifies("app.doctor-secrets", () => {
  const filesToken = {
    secret: "files-token",
    usedBy: [{ kind: "connector" as const, id: "files" }],
  };
  const mockKey = { secret: "mock-key", usedBy: [{ kind: "provider" as const, id: "mock" }] };

  it("fails a Secrets line with each secret that isn't set, so doctor exits 1", async () => {
    const { service, asked } = doctor({ secrets: { "mock-key": "stored" } });

    const report = await service.check(workspace({ secrets: [filesToken, mockKey] }));

    expect(report.secrets).toEqual({
      check: "secrets",
      status: "failed",
      missing: [filesToken],
      unreadable: [],
    });
    expect(report.summary).toEqual({ problems: 1, warnings: 0, needsFixing: true });
    expect(asked.sort()).toEqual(["files-token", "mock-key"]);
  });

  it("has no Secrets line when every secret is set, or outside a workspace", async () => {
    const set = doctor({ secrets: { "files-token": "stored" } });
    expect((await set.service.check(workspace({ secrets: [filesToken] }))).secrets).toBeUndefined();
    expect((await doctor().service.check(null)).secrets).toBeUndefined();
  });

  it("warns about a secret the store throws for, and still finishes", async () => {
    const { service } = doctor({
      unreadable: ["files-token", "ANTHROPIC_API_KEY"],
      secrets: { "mock-key": "stored" },
    });

    const report = await service.check(
      workspace({
        providers: [anthropic],
        aliases: [{ alias: "smart", provider: "anthropic" }],
        secrets: [filesToken, mockKey],
      }),
    );

    expect(report.secrets).toEqual({
      check: "secrets",
      status: "warning",
      missing: [],
      unreadable: [filesToken],
    });
    // A provider key the store throws for counts as not stored.
    expect(report.models?.status).toBe("warning");
    expect(report.summary.needsFixing).toBe(false);
  });
});
