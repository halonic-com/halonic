import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FolderDefinitionStore } from "@halonicjs/adapter-fs-node";
import type { Provider } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
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
  it("names the workspace and gives the trust check every connector and agent", async () => {
    const workspace = await workspaceOf({
      "workspace.yaml": acmeSettings,
      "library/connectors/files.connector.yaml":
        "name: Files\ntransport:\n  stdio:\n    command: acme-files\ntools:\n  approve: []\n",
      "hubs/support/hub.yaml": "id: support\nname: Support\n",
      "hubs/support/agents/writer.agent.yaml":
        "id: writer\nname: Writer\ninstructions: Write.\nharness: claude-code\n",
    });
    const commandPaths = new Map([["acme-files", "/usr/bin/acme-files"]]);

    const doctor = doctorWorkspace({
      workspace,
      location: "/work/acme",
      fallbackName: "./acme",
      commandPaths,
    });

    expect(doctor.name).toBe("Acme");
    expect(doctor.trust.location).toBe("/work/acme");
    expect(doctor.trust.commandPaths).toBe(commandPaths);
    expect(doctor.trust.connectors.map((connector) => connector.id)).toEqual(["files"]);
    expect(doctor.trust.agents.map((agent) => [agent.id, agent.harness])).toEqual([
      ["writer", "claude-code"],
    ]);
  });

  it("shows the folder as typed when workspace.yaml didn't parse", async () => {
    const workspace = await workspaceOf({ "workspace.yaml": "name: [\n" });
    const doctor = doctorWorkspace({
      workspace,
      location: root,
      fallbackName: "./acme",
      commandPaths: new Map(),
    });
    expect(doctor.name).toBe("./acme");
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
      location: root,
      fallbackName: "./acme",
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
      location: root,
      fallbackName: "./acme",
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

  it("uses the server's default address when the file gives none", () => {
    expect(doctorProvider({ ...base, type: "ollama", local: true })).toMatchObject({
      address: "localhost:11434",
    });
    expect(doctorProvider({ ...base, type: "lmstudio", local: true })).toMatchObject({
      address: "localhost:1234",
    });
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
