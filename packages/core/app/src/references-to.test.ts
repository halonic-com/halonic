import { verifies } from "@halonicjs/testing-spec";
import { loadWorkspace } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { referencesTo } from "./references-to.ts";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";

/** An agent file with the given extra lines. */
function agentFile(id: string, name: string, extra = ""): string {
  return `id: ${id}\nname: ${name}\n${extra}`;
}

async function acme() {
  return loadWorkspace(
    new TestDefinitionStore({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "hubs/support/hub.yaml":
        "id: support\nname: Support\nuses:\n  connectors: [gmail]\n  knowledge: [kb]\n",
      "hubs/support/agents/support.agent.yaml": agentFile(
        "support",
        "Support",
        "knowledge: [kb]\nconnectors: [gmail]\n",
      ),
      "hubs/support/agents/billing.agent.yaml": agentFile(
        "billing",
        "Billing",
        "knowledge: [kb]\n",
      ),
      "hubs/support/agents/sales.agent.yaml": agentFile(
        "sales",
        "Sales",
        "skills: [pitch, triage]\n",
      ),
      "hubs/support/workflows/routines/inbox.routine.yaml":
        "id: inbox\nname: Inbox\ntrigger:\n  mail:\n    connector: gmail\nrun:\n  agent: support\n  prompt: Reply\n",
      "library/collections/customers.collection.yaml":
        "id: customers\nname: Customers\nfields:\n  name:\n    type: text\n",
      "library/collections/orders.collection.yaml":
        "id: orders\nname: Orders\nfields:\n  customer:\n    type: ref\n    collection: customers\n",
    }),
  );
}

verifies("app.references-to", () => {
  it("gives the entry of each agent's list and of the hub's uses, in the order of the paths", async () => {
    const places = referencesTo(await acme(), { kind: "knowledge", id: "kb", hub: null });

    expect(places).toEqual([
      { file: "hubs/support/agents/billing.agent.yaml", path: ["knowledge", 0], owner: "Billing" },
      { file: "hubs/support/agents/support.agent.yaml", path: ["knowledge", 0], owner: "Support" },
      { file: "hubs/support/hub.yaml", path: ["uses", "knowledge", 0], owner: "Support" },
    ]);
  });

  it("gives the position of the id inside a list", async () => {
    expect(referencesTo(await acme(), { kind: "skill", id: "triage", hub: null })).toEqual([
      { file: "hubs/support/agents/sales.agent.yaml", path: ["skills", 1], owner: "Sales" },
    ]);
  });

  it("gives the connector of a mail trigger", async () => {
    const places = referencesTo(await acme(), { kind: "connector", id: "gmail", hub: null });

    expect(places).toContainEqual({
      file: "hubs/support/workflows/routines/inbox.routine.yaml",
      path: ["trigger", "mail", "connector"],
      owner: "Inbox",
    });
  });

  it("gives the collection of a ref field, never the collection itself", async () => {
    const workspace = await acme();

    expect(referencesTo(workspace, { kind: "collection", id: "customers", hub: null })).toEqual([
      {
        file: "library/collections/orders.collection.yaml",
        path: ["fields", "customer", "collection"],
        owner: "Orders",
      },
    ]);
    expect(referencesTo(workspace, { kind: "collection", id: "orders", hub: null })).toEqual([]);
  });

  it("gives an empty list for an item nothing names", async () => {
    expect(referencesTo(await acme(), { kind: "skill", id: "unused", hub: null })).toEqual([]);
  });
});
