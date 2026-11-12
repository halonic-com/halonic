import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { callModelName, definitionsOf, loadWorkspace, modelPrice } from "./index.ts";
import { MemorySource } from "./test/memory-source.ts";

const models = [
  "aliases:",
  "  smart:",
  "    provider: mock",
  "    model: echo-smart",
  "  fast:",
  "    provider: mock",
  "    model: echo-fast",
  "",
].join("\n");

const files: Record<string, string> = {
  "workspace.yaml": "id: acme\nname: Acme\ndefaults:\n  model: smart\n",
  "providers/mock.yaml": "id: mock\nname: Mock\ntype: mock\nlocal: true\n",
  "models.yaml": models,
  "hubs/billing/hub.yaml": "id: billing\nname: Billing\ndefaults:\n  model: fast\n",
  "hubs/billing/agents/clerk.agent.yaml": "id: clerk\nname: Clerk\ninstructions: Help.\n",
  "hubs/billing/agents/writer.agent.yaml":
    "id: writer\nname: Writer\ninstructions: Help.\nmodel: smart\n",
};

async function billing(changed: Record<string, string> = {}) {
  const workspace = await loadWorkspace(new MemorySource({ ...files, ...changed }));
  expect(workspace.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  return definitionsOf(workspace, "billing");
}

verifies("workspace.call-model", () => {
  it("names the call's alias over its agent's model", async () => {
    expect(callModelName(await billing(), { alias: "fast", agentId: "writer" })).toBe("fast");
  });

  it("names the agent's model when the call has no alias", async () => {
    expect(callModelName(await billing(), { agentId: "writer" })).toBe("smart");
  });

  it("names the hub's default for an agent without a model, over the workspace's", async () => {
    expect(callModelName(await billing(), { agentId: "clerk" })).toBe("fast");
  });

  it("names the workspace's default when the hub has none", async () => {
    const definitions = await billing({ "hubs/billing/hub.yaml": "id: billing\nname: Billing\n" });
    expect(callModelName(definitions, { agentId: "nobody" })).toBe("smart");
  });

  it("names `default` when neither the hub nor the workspace has a default", async () => {
    const definitions = await billing({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "hubs/billing/hub.yaml": "id: billing\nname: Billing\n",
    });
    expect(callModelName(definitions, {})).toBe("default");
  });

  it("leaves out the cache prices an alias doesn't have", () => {
    const price = modelPrice({ input: 5, output: 25 });
    expect(price).toStrictEqual({ input: 5, output: 25 });
  });

  it("keeps every cache price an alias has", () => {
    const price = { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25, cacheWrite1h: 10 };
    expect(modelPrice(price)).toStrictEqual(price);
  });
});
