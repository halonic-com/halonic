import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import type { Provider } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import {
  type LoadedWorkspace,
  type LocalIntegrationInput,
  loadWorkspace,
} from "@halonicjs/workspace";
import { afterEach, beforeEach, expect, it } from "vitest";
import { doctorProvider, doctorWorkspace } from "./doctor-workspace.ts";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "halonic-doctor-workspace-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Writes the files, by path in the workspace, and loads the workspace from them. */
async function workspaceOf(files: Record<string, string>): Promise<LoadedWorkspace> {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return loadWorkspace(new FolderDefinitionStore(root, "./acme"));
}

const acmeSettings = "id: acme\nname: Acme\n";

const providerFiles = {
  "providers/anthropic.yaml":
    "id: anthropic\nname: Anthropic\ntype: anthropic\nsecret: anthropic\n",
  "providers/ollama.yaml":
    "id: ollama\nname: Ollama\ntype: ollama\nbaseUrl: http://localhost:11434/v1\nlocal: true\n",
};

verifies("cli.doctor-workspace", () => {
  it("names the workspace and gives the trust check every connector, agent and local integration", async () => {
    const workspace = await workspaceOf({
      "workspace.yaml": acmeSettings,
      "library/connectors/files.connector.yaml":
        "name: Files\ntransport:\n  stdio:\n    command: acme-files\ntools:\n  approve: []\n",
      "hubs/support/hub.yaml": "id: support\nname: Support\n",
      "hubs/support/agents/writer.agent.yaml":
        "id: writer\nname: Writer\ninstructions: Write.\nharness: claude-code\n",
    });
    const commandPaths = new Map([["acme-files", "/usr/bin/acme-files"]]);
    const integrations: LocalIntegrationInput[] = [];

    const doctor = doctorWorkspace({
      workspace,
      integrations,
      location: "/work/acme",
      fallbackName: "acme",
      commandPaths,
    });

    expect(doctor.name).toBe("Acme");
    expect(doctor.trust.location).toBe("/work/acme");
    expect(doctor.trust.commandPaths).toBe(commandPaths);
    expect(doctor.trust.integrations).toEqual(integrations);
    expect(doctor.trust.connectors.map((connector) => connector.id)).toEqual(["files"]);
    expect(doctor.trust.agents.map((agent) => [agent.id, agent.harness])).toEqual([
      ["writer", "claude-code"],
    ]);
  });

  it("finds a workspace on the test model only, as run's trust skip does", async () => {
    const mock = "id: mock\nname: Test model\ntype: mock\nlocal: true\n";
    const onTheTestModel = await workspaceOf({
      "workspace.yaml": acmeSettings,
      "providers/mock.yaml": mock,
    });
    const doctorOf = (workspace: LoadedWorkspace) =>
      doctorWorkspace({
        workspace,
        integrations: [],
        location: root,
        fallbackName: "acme",
        commandPaths: new Map(),
      });

    expect(doctorOf(onTheTestModel).testModelOnly).toBe(true);
    const withAnthropic = await workspaceOf(providerFiles);
    expect(doctorOf(withAnthropic).testModelOnly).toBe(false);
  });

  it("shows the folder's own name when workspace.yaml didn't parse", async () => {
    const workspace = await workspaceOf({ "workspace.yaml": "name: [\n" });
    const doctor = doctorWorkspace({
      workspace,
      integrations: [],
      location: root,
      fallbackName: "acme",
      commandPaths: new Map(),
    });
    expect(doctor.name).toBe("acme");
  });

  // HAL-14260: both passed `doctor` with ✓ and then stopped the run.
  it("counts a provider type Halonic can't call and a default alias a workflow's agent would miss", async () => {
    const workspace = await workspaceOf({
      "workspace.yaml": acmeSettings,
      "providers/mock.yaml": "id: mock\ntype: antropic\n",
      "hubs/notes/hub.yaml": "id: notes\nname: Notes\n",
      "hubs/notes/agents/clerk.agent.yaml": "id: clerk\nname: Clerk\ninstructions: Take notes.\n",
      "hubs/notes/workflows/take-notes.workflow.yaml":
        "id: take-notes\nname: Take notes\ninitial: write\nstates:\n  write:\n    agent: clerk\n    on:\n      - to: done\n  done:\n    type: final\n",
    });
    const doctor = doctorWorkspace({
      workspace,
      integrations: [],
      location: root,
      fallbackName: "acme",
      commandPaths: new Map(),
    });
    expect(doctor.fileProblems).toBe(2);
    expect(doctor.testModelOnly).toBe(false);
  });

  it("lists the aliases of models.yaml in order, then a hub's that point somewhere new", async () => {
    const workspace = await workspaceOf({
      "workspace.yaml": acmeSettings,
      "models.yaml": [
        "aliases:",
        "  smart: { provider: anthropic, model: claude }",
        "  local: { provider: ollama, model: llama3.2 }",
        "  writer: { provider: anthropic, model: claude }",
      ].join("\n"),
      "hubs/support/hub.yaml": [
        "id: support",
        "name: Support",
        "models:",
        "  smart: { provider: anthropic, model: claude }",
        "  local: { provider: anthropic, model: claude }",
      ].join("\n"),
      ...providerFiles,
    });

    const doctor = doctorWorkspace({
      workspace,
      integrations: [],
      location: root,
      fallbackName: "acme",
      commandPaths: new Map(),
    });

    expect(doctor.aliases).toEqual([
      { alias: "smart", provider: "anthropic" },
      { alias: "local", provider: "ollama" },
      { alias: "writer", provider: "anthropic" },
      { alias: "local", provider: "anthropic" },
    ]);
    expect(doctor.providers).toEqual([
      { provider: "anthropic", name: "Anthropic", runs: "with-a-key", secret: "anthropic" },
      { provider: "ollama", name: "Ollama", runs: "on-this-computer", address: "localhost:11434" },
    ]);
  });

  it("leaves out a provider without a file, with its aliases, so the Models line can't fail on it", async () => {
    const workspace = await workspaceOf({
      "workspace.yaml": acmeSettings,
      "models.yaml": [
        "aliases:",
        "  smart: { provider: anthropic, model: claude }",
        "  fast: { provider: gone, model: tiny }",
      ].join("\n"),
      ...providerFiles,
    });

    const doctor = doctorWorkspace({
      workspace,
      integrations: [],
      location: root,
      fallbackName: "acme",
      commandPaths: new Map(),
    });

    expect(doctor.aliases).toEqual([{ alias: "smart", provider: "anthropic" }]);
    expect(doctor.providers.map((provider) => provider.provider)).toEqual(["anthropic"]);
  });
});

verifies("cli.doctor-workspace", () => {
  const base: Provider = {
    version: 1,
    id: "p",
    type: "openai-compatible",
    local: false,
    options: {},
  };

  it("needs no key for the test model, though its file says local", () => {
    expect(
      doctorProvider({ ...base, id: "mock", name: "Test model", type: "mock", local: true }),
    ).toEqual({
      provider: "mock",
      name: "Test model",
      runs: "without-a-key",
    });
  });

  it("reaches a server on this computer at its baseUrl's host, without the path", () => {
    const provider = { ...base, local: true, baseUrl: "http://127.0.0.1:8080/v1" };
    expect(doctorProvider(provider)).toEqual({
      provider: "p",
      name: "p",
      runs: "on-this-computer",
      address: "127.0.0.1:8080",
    });
  });

  it("shows a baseUrl without http:// as written, never an empty address", () => {
    const provider = { ...base, type: "ollama", local: true, baseUrl: "localhost:11434" };
    expect(doctorProvider(provider)).toMatchObject({ address: "localhost:11434" });
  });

  it("uses the server's default address when the file gives none", () => {
    expect(doctorProvider({ ...base, type: "ollama", local: true })).toMatchObject({
      address: "localhost:11434",
    });
    expect(doctorProvider({ ...base, type: "lmstudio", local: true })).toMatchObject({
      address: "localhost:1234",
    });
  });

  it("shows a baseUrl without a host as written, never an empty address (C15)", () => {
    const provider = { ...base, type: "ollama", local: true, baseUrl: "localhost:11434" };
    expect(doctorProvider(provider)).toMatchObject({ address: "localhost:11434" });
  });

  it("leaves out a server on this computer whose address it doesn't know", () => {
    expect(doctorProvider({ ...base, type: "llamafile", local: true })).toBeUndefined();
  });

  it("needs the key in its secret for a provider with one, and no key without", () => {
    expect(doctorProvider({ ...base, secret: "openai-key" })).toMatchObject({
      runs: "with-a-key",
      secret: "openai-key",
    });
    expect(doctorProvider(base)).toMatchObject({ runs: "without-a-key" });
  });
});

verifies("cli.doctor-secrets", () => {
  it("reads the secrets of used connectors and of providers the Models line doesn't check, each once", async () => {
    const workspace = await workspaceOf({
      "workspace.yaml": acmeSettings,
      "models.yaml":
        "aliases:\n  smart:\n    provider: anthropic\n    model: claude-sonnet-5-5\n  local:\n    provider: studio\n    model: qwen\n",
      "providers/anthropic.yaml": providerFiles["providers/anthropic.yaml"],
      "providers/studio.yaml":
        "id: studio\nname: LM Studio\ntype: lmstudio\nbaseUrl: http://localhost:1234/v1\nlocal: true\nsecret: notes-token\n",
      "library/connectors/files.connector.yaml":
        "transport:\n  stdio:\n    command: acme-files\n    secretEnv:\n      FILES_TOKEN: files-token\n      FILES_TOKEN_AGAIN: files-token\n",
      "library/connectors/notes.connector.yaml":
        "transport:\n  http:\n    url: https://notes.acme.test/mcp\nsecret: notes-token\n",
      "library/connectors/unused.connector.yaml":
        "transport:\n  http:\n    url: https://unused.acme.test/mcp\nsecret: unused-token\n",
      "hubs/support/hub.yaml": "id: support\nname: Support\n",
      "hubs/support/agents/writer.agent.yaml":
        "id: writer\nname: Writer\ninstructions: Write.\nconnectors: [files, notes]\n",
    });

    const doctor = doctorWorkspace({
      workspace,
      integrations: [],
      location: "/work/acme",
      fallbackName: "acme",
      commandPaths: new Map(),
    });

    // Anthropic's key stays on the Models line, and no agent uses `unused`.
    expect(doctor.secrets).toEqual([
      { secret: "files-token", usedBy: [{ kind: "connector", id: "files" }] },
      {
        secret: "notes-token",
        usedBy: [
          { kind: "connector", id: "notes" },
          { kind: "provider", id: "studio" },
        ],
      },
    ]);
  });

  /** Reads the secrets of a workspace with the agent Writer in the hub support. */
  async function secretsOf(files: Record<string, string>) {
    const workspace = await workspaceOf({
      "workspace.yaml": acmeSettings,
      "hubs/support/agents/writer.agent.yaml":
        "id: writer\nname: Writer\ninstructions: Write.\nconnectors: [files, notes]\n",
      ...files,
    });
    return doctorWorkspace({
      workspace,
      integrations: [],
      location: "/work/acme",
      fallbackName: "acme",
      commandPaths: new Map(),
    }).secrets;
  }

  it("counts names that differ only in case or in - and _ as one secret, as first written", async () => {
    const secrets = await secretsOf({
      "hubs/support/hub.yaml": "id: support\nname: Support\n",
      "library/connectors/files.connector.yaml":
        "transport:\n  http:\n    url: https://files.acme.test/mcp\nsecret: files-token\n",
      "library/connectors/notes.connector.yaml":
        "transport:\n  http:\n    url: https://notes.acme.test/mcp\nsecret: FILES_TOKEN\n",
    });

    expect(secrets).toEqual([
      {
        secret: "files-token",
        usedBy: [
          { kind: "connector", id: "files" },
          { kind: "connector", id: "notes" },
        ],
      },
    ]);
  });

  it("leaves out a secret the Models line checks as a cloud provider's key, whatever else uses it", async () => {
    const secrets = await secretsOf({
      "hubs/support/hub.yaml": "id: support\nname: Support\n",
      "models.yaml": "aliases:\n  smart:\n    provider: anthropic\n    model: claude-sonnet-5-5\n",
      "providers/anthropic.yaml": providerFiles["providers/anthropic.yaml"],
      "library/connectors/files.connector.yaml":
        "transport:\n  http:\n    url: https://files.acme.test/mcp\nsecret: Anthropic\n",
    });

    expect(secrets).toEqual([]);
  });

  it("reads the webhook secret of each enabled routine, and not of one switched off (C340)", async () => {
    const routine = (id: string, enabled: boolean, secret: string) =>
      `id: ${id}\nname: ${id}\nenabled: ${enabled}\ntrigger:\n  webhook:\n    secret: ${secret}\n` +
      "run:\n  hub: support\n  agent: writer\n  prompt: Sum up the week.\n";
    const secrets = await secretsOf({
      "workflows/routines/friday-digest.routine.yaml": routine(
        "friday-digest",
        true,
        "friday-hook",
      ),
      "workflows/routines/old-digest.routine.yaml": routine("old-digest", false, "old-hook"),
    });

    expect(secrets).toEqual([
      { secret: "friday-hook", usedBy: [{ kind: "routine", id: "friday-digest" }] },
    ]);
  });

  it("leaves out a shared connector the agent's hub doesn't allow, as a run does", async () => {
    const secrets = await secretsOf({
      "hubs/support/hub.yaml": "id: support\nname: Support\nuses:\n  connectors: [notes]\n",
      "library/connectors/files.connector.yaml":
        "transport:\n  http:\n    url: https://files.acme.test/mcp\nsecret: files-token\n",
      "library/connectors/notes.connector.yaml":
        "transport:\n  http:\n    url: https://notes.acme.test/mcp\nsecret: notes-token\n",
    });

    expect(secrets).toEqual([
      { secret: "notes-token", usedBy: [{ kind: "connector", id: "notes" }] },
    ]);
  });
});
