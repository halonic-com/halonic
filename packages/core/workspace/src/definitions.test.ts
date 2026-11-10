import type { Digest } from "@halonicjs/ports";
import { bytesToHex, canonicalJson, encodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { definitionsOf, definitionsVersion, loadWorkspace, runDefinitionsOf } from "./index.ts";
import { MemorySource } from "./test/memory-source.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

function agent(id: string, instructions = "Help."): string {
  return `id: ${id}\nname: ${id}\ninstructions: ${instructions}\n`;
}

function workflow(id: string, agentId: string): string {
  return [
    `id: ${id}`,
    `name: ${id}`,
    "initial: work",
    "states:",
    "  work:",
    `    agent: ${agentId}`,
    "    on:",
    "      - to: done",
    "  done:",
    "    type: final",
    "",
  ].join("\n");
}

function skill(name: string): string {
  return `---\nname: ${name}\ndescription: ${name}.\n---\n\nBe brief.\n`;
}

const files: Record<string, string> = {
  "workspace.yaml": "id: acme\nname: Acme\ndefaults:\n  model: fast\n",
  "providers/mock.yaml": "id: mock\nname: Mock\ntype: mock\nlocal: true\n",
  "models.yaml": "aliases:\n  fast:\n    provider: mock\n    model: echo\n",
  "agents/helper.agent.yaml": agent("helper"),
  "workflows/tidy.workflow.yaml": workflow("tidy", "helper"),
  "library/skills/notes/SKILL.md": skill("notes"),
  "library/skills/search/SKILL.md": skill("search"),
  "hubs/billing/hub.yaml": "id: billing\nname: Billing\nuses:\n  skills: [notes]\n",
  "hubs/billing/agents/clerk.agent.yaml": agent("clerk"),
  "hubs/billing/workflows/invoice.workflow.yaml": workflow("invoice", "clerk"),
  "hubs/billing/library/skills/house-style/SKILL.md": skill("house-style"),
};

async function load(changed: Record<string, string> = {}) {
  const workspace = await loadWorkspace(new MemorySource({ ...files, ...changed }));
  expect(workspace.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  return workspace;
}

verifies("workspace.definitions", () => {
  it("holds the hub's own workflows and agents, not the root's", async () => {
    const definitions = definitionsOf(await load(), "billing");
    expect(Object.keys(definitions.workflows)).toEqual(["invoice"]);
    expect(Object.keys(definitions.agents)).toEqual(["clerk"]);
    expect(definitions.workflows["invoice"]?.initial).toBe("work");
    expect(definitions.hub?.name).toBe("Billing");
    expect(definitions.settings?.name).toBe("Acme");
    expect(Object.keys(definitions.providers)).toEqual(["mock"]);
  });

  it("gives the shared library items the hub's uses allows, and its own", async () => {
    const definitions = definitionsOf(await load(), "billing");
    expect(Object.keys(definitions.skills).sort()).toEqual(["house-style", "notes"]);
  });

  it("gives every shared item to a hub without uses", async () => {
    const workspace = await load({ "hubs/billing/hub.yaml": "id: billing\nname: Billing\n" });
    expect(Object.keys(definitionsOf(workspace, "billing").skills).sort()).toEqual([
      "house-style",
      "notes",
      "search",
    ]);
  });

  it("resolves the hub's aliases and takes the workspace's default model", async () => {
    const definitions = definitionsOf(await load(), "billing");
    expect(definitions.defaultModel).toBe("fast");
    expect(definitions.models).toEqual({
      fast: { provider: "mock", model: "echo", params: {}, alias: "fast", fallback: [] },
    });
  });

  it("has a version that ignores file order and changes with the definitions", async () => {
    const version = await definitionsVersion(definitionsOf(await load(), "billing"), digest);
    const reversed = Object.fromEntries(Object.entries(files).reverse());
    const sameFiles = await loadWorkspace(new MemorySource(reversed));
    expect(await definitionsVersion(definitionsOf(sameFiles, "billing"), digest)).toBe(version);
    const changed = await load({
      "hubs/billing/agents/clerk.agent.yaml": agent("clerk", "Hurry."),
    });
    expect(await definitionsVersion(definitionsOf(changed, "billing"), digest)).not.toBe(version);
  });

  it("is the SHA-256 of the canonical JSON, the hash the blob store gives it", async () => {
    const definitions = definitionsOf(await load(), "billing");
    const hash = await digest.sha256(encodeUtf8(canonicalJson(definitions)));
    expect(await definitionsVersion(definitions, digest)).toBe(bytesToHex(hash));
  });

  it("refuses a hub the workspace doesn't have", async () => {
    const workspace = await load();
    expect(() => definitionsOf(workspace, "nowhere")).toThrow(RangeError);
  });
});

verifies("workspace.run-definitions", () => {
  it("starts a run with the workflow and the hub's agents, workflows, collections and knowledge", async () => {
    const definitions = runDefinitionsOf(await load(), "billing", "invoice");
    expect(definitions.workflow.id).toBe("invoice");
    expect(Object.keys(definitions.agents)).toEqual(["clerk"]);
    expect(Object.keys(definitions.workflows)).toEqual(["invoice"]);
    expect(definitions.collections).toEqual({});
    expect(definitions.knowledge).toEqual({});
    expect(definitions.connectorTools).toEqual({});
  });

  it("starts a run with the tools lists of the connectors the hub can see, and none of their transport", async () => {
    const tracker = [
      "transport:",
      "  http:",
      "    url: https://tracker.example.com/mcp",
      "tools:",
      "  allow: [search_issues, create_issue]",
      "  approve: [create_issue]",
      "",
    ].join("\n");
    const workspace = await load({
      "hubs/billing/library/connectors/tracker.connector.yaml": tracker,
    });

    const definitions = runDefinitionsOf(workspace, "billing", "invoice");

    expect(definitions.connectorTools).toEqual({
      tracker: { allow: ["search_issues", "create_issue"], approve: ["create_issue"] },
    });
  });

  it("refuses a workflow the hub doesn't have, naming the hub and the workflow", async () => {
    const workspace = await load();
    expect(() => runDefinitionsOf(workspace, "billing", "tidy")).toThrow(
      new RangeError('The hub "billing" has no workflow "tidy".'),
    );
  });

  it("refuses a hub the workspace doesn't have", async () => {
    const workspace = await load();
    expect(() => runDefinitionsOf(workspace, "nowhere", "invoice")).toThrow(RangeError);
  });
});
