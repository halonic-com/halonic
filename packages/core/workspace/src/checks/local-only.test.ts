import type { SheetHosts } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { loadWorkspace } from "../index.ts";
import { MemorySource } from "../test/memory-source.ts";

const turnOff = "or set privacy.localOnly: false in workspace.yaml";

const cloud = {
  "providers/anthropic.yaml": "id: anthropic\ntype: anthropic\nsecret: anthropic-key\n",
  "models.yaml": "aliases:\n  smart: { provider: anthropic, model: claude-opus-5-5 }\n",
};

const local = {
  "providers/mock.yaml": "id: mock\ntype: mock\n",
  "providers/ollama.yaml": "id: ollama\ntype: ollama\nlocal: true\n",
  "models.yaml":
    "aliases:\n  default: { provider: mock, model: echo }\n  fast: { provider: ollama, model: llama3.2 }\n",
  "agents/clerk.agent.yaml": "name: Clerk\nmodel: ollama/llama3.2\n",
  "library/connectors/files.connector.yaml":
    "name: Files\ntransport:\n  stdio: { command: files-server }\n",
  "library/connectors/tracker.connector.yaml":
    "name: Tracker\ntransport:\n  http: { url: http://127.0.0.1:3000 }\n",
};

/** The issues of a workspace with these files, as `file key.path: message`. */
async function issuesIn(
  localOnly: boolean,
  files: Record<string, string>,
  sheetHosts?: SheetHosts,
): Promise<string[]> {
  const settings = `id: acme\nname: Acme\nprivacy: { localOnly: ${localOnly} }\n`;
  const source = new MemorySource({ "workspace.yaml": settings, ...files });
  const workspace = await loadWorkspace(source, sheetHosts === undefined ? {} : { sheetHosts });
  return workspace.issues.map(
    (issue) => `${issue.severity} ${issue.file} ${issue.path.join(".")}: ${issue.message}`,
  );
}

verifies("workspace.local-only", () => {
  it("refuses a cloud model alias in a local-only workspace, and says how to turn it off", async () => {
    expect(await issuesIn(true, cloud)).toEqual([
      `error models.yaml aliases.smart.provider: Alias "smart" uses provider "anthropic", which isn't local, and the workspace is local only: point it at a local provider, ${turnOff}`,
    ]);
  });

  it("lets a workspace that isn't local only use the cloud", async () => {
    expect(await issuesIn(false, cloud)).toEqual([]);
  });

  it("refuses a cloud provider/model setting and a connector that isn't local", async () => {
    const issues = await issuesIn(true, {
      ...cloud,
      "models.yaml": "aliases: {}\n",
      "hubs/billing/hub.yaml":
        "name: Billing\ndefaults: { model: anthropic/claude-opus-5-5 }\nmodels:\n  careful: { provider: anthropic, model: claude-opus-5-5 }\n",
      "agents/writer.agent.yaml":
        "name: Writer\nmodel: anthropic/claude-opus-5-5\nmethods:\n  draft:\n    instructions: Draft it.\n    model: anthropic/claude-opus-5-5\n",
      "library/connectors/tracker.connector.yaml":
        "name: Tracker\ntransport:\n  http: { url: https://tracker.example.com }\n",
      "library/connectors/mail.connector.yaml":
        "name: Mail\nlocal: false\ntransport:\n  http: { url: http://localhost:8025 }\n",
    });
    const model = `whose provider "anthropic" isn't local, and the workspace is local only: use a local model, ${turnOff}`;
    const connector = `isn't local, and the workspace is local only: set local: true if it runs on this computer, ${turnOff}`;
    expect(issues).toEqual([
      `error agents/writer.agent.yaml model: Agent "writer" uses model "anthropic/claude-opus-5-5", ${model}`,
      `error agents/writer.agent.yaml methods.draft.model: Method "writer.draft" uses model "anthropic/claude-opus-5-5", ${model}`,
      `error hubs/billing/hub.yaml models.careful.provider: Alias "careful" uses provider "anthropic", which isn't local, and the workspace is local only: point it at a local provider, ${turnOff}`,
      `error hubs/billing/hub.yaml defaults.model: The hub's default model uses model "anthropic/claude-opus-5-5", ${model}`,
      `error library/connectors/mail.connector.yaml local: Connector "mail" ${connector}`,
      `error library/connectors/tracker.connector.yaml transport: Connector "tracker" ${connector}`,
    ]);
  });

  it("allows local providers, the mock model and local connectors", async () => {
    expect(await issuesIn(true, local)).toEqual([]);
  });
});

verifies("workspace.local-only-harness", () => {
  it("refuses an agent that runs in a harness program, but not one in Halonic's own loop", async () => {
    const issues = await issuesIn(true, {
      ...local,
      "agents/writer.agent.yaml": "name: Writer\nmodel: ollama/llama3.2\nharness: claude-code\n",
      "agents/coder.agent.yaml": "name: Coder\nmodel: ollama/llama3.2\nharness: codex\n",
      "agents/sorter.agent.yaml": "name: Sorter\nmodel: ollama/llama3.2\nharness: halonic\n",
    });
    const harness = `which sends its work to its own cloud model, and the workspace is local only: remove harness to run it in Halonic's own loop, ${turnOff}`;
    expect(issues).toEqual([
      `error agents/coder.agent.yaml harness: Agent "coder" runs in codex, ${harness}`,
      `error agents/writer.agent.yaml harness: Agent "writer" runs in claude-code, ${harness}`,
    ]);
  });

  it("lets a harness agent run in a workspace that isn't local only", async () => {
    const writer = "name: Writer\nmodel: ollama/llama3.2\nharness: claude-code\n";
    expect(await issuesIn(false, { ...local, "agents/writer.agent.yaml": writer })).toEqual([]);
  });
});

verifies("workspace.local-only-sheet-hosts", () => {
  const runners = {
    "library/connectors/orders.connector.yaml":
      "name: Orders\nlocal: true\ntransport:\n  plugin: { id: acme-orders }\n",
    "library/connectors/notes.connector.yaml":
      "name: Notes\nlocal: true\ntransport:\n  integration: { folder: notes }\n",
  };
  const outside: SheetHosts = {
    plugins: new Map([["acme-orders", ["api.acme.example"]]]),
    integrations: new Map([["notes", [{ fromSetting: "server", class: "public" }]]]),
  };
  const inside: SheetHosts = {
    plugins: new Map([["acme-orders", ["orders.localhost"]]]),
    integrations: new Map([["notes", [{ fromSetting: "server", class: "private" }]]]),
  };
  const fix = "so it isn't local: set privacy.localOnly: false in workspace.yaml to use it";

  it("doesn't count local: true when the sheet reaches outside hosts, and names them", async () => {
    expect(await issuesIn(true, { ...local, ...runners }, outside)).toEqual([
      `error library/connectors/notes.connector.yaml local: The integration in integrations/notes reaches the address in its server setting, ${fix}`,
      `error library/connectors/orders.connector.yaml local: The plugin acme-orders reaches api.acme.example, ${fix}`,
    ]);
  });

  it("counts local: true when the sheet's hosts are all local", async () => {
    expect(await issuesIn(true, { ...local, ...runners }, inside)).toEqual([]);
  });

  it("doesn't count local: true for a sheet it wasn't given", async () => {
    const none: SheetHosts = { plugins: new Map(), integrations: new Map() };
    const message = `isn't local, and the workspace is local only: set privacy.localOnly: false in workspace.yaml to use it`;
    expect(await issuesIn(true, { ...local, ...runners }, none)).toEqual([
      `error library/connectors/notes.connector.yaml local: Connector "notes" ${message}`,
      `error library/connectors/orders.connector.yaml local: Connector "orders" ${message}`,
    ]);
  });

  it("offers no local: true for a plugin's connector", async () => {
    const orders = "name: Orders\ntransport:\n  plugin: { id: acme-orders }\n";
    expect(
      await issuesIn(true, { ...local, "library/connectors/orders.connector.yaml": orders }),
    ).toEqual([
      `error library/connectors/orders.connector.yaml transport: Connector "orders" isn't local, and the workspace is local only: set privacy.localOnly: false in workspace.yaml to use it`,
    ]);
  });
});
