import { verifies } from "@halonicjs/testing-spec";
import { type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { expect, it } from "vitest";
import { TestDefinitionStore } from "./testing/memory-definition-store.ts";
import { whoUses } from "./who-uses.ts";

/** An agent file with the given extra lines. */
function agentFile(id: string, name: string, extra = ""): string {
  return `id: ${id}\nname: ${name}\n${extra}`;
}

/** A skill file. */
function skillFile(id: string): string {
  return `---\nname: ${id}\ndescription: ${id}.\n---\n\nBe brief.\n`;
}

/** Acme: three agents, a hub with `uses`, a mail routine and two collections that refer to each other. */
async function acme(): Promise<LoadedWorkspace> {
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
      "hubs/support/agents/sales.agent.yaml": agentFile("sales", "Sales", "skills: [pitch]\n"),
      "hubs/support/workflows/routines/inbox.routine.yaml":
        "id: inbox\nname: Inbox\ntrigger:\n  mail:\n    connector: gmail\nrun:\n  agent: support\n  prompt: Reply\n",
      "library/skills/triage/SKILL.md": skillFile("triage"),
      "hubs/support/library/skills/triage/SKILL.md": skillFile("triage"),
      "hubs/support/agents/helper.agent.yaml": agentFile("helper", "Helper", "skills: [triage]\n"),
      "agents/lead.agent.yaml": agentFile("lead", "Lead", "skills: [triage]\n"),
      "library/collections/customers.collection.yaml":
        "id: customers\nname: Customers\nfields:\n  name:\n    type: text\n",
      "library/collections/orders.collection.yaml":
        "id: orders\nname: Orders\nfields:\n  customer:\n    type: ref\n    collection: customers\n",
    }),
  );
}

verifies("app.who-uses", () => {
  it("lists the agents and hubs that list a knowledge source", async () => {
    const usage = whoUses(await acme(), { kind: "knowledge", id: "kb", hub: null });

    expect(usage.agents.map((each) => each.name)).toEqual(["Billing", "Support"]);
    expect(usage.hubs.map((each) => each.id)).toEqual(["support"]);
  });

  it("lists the agents of a skill, and the routines and hub of a connector", async () => {
    const workspace = await acme();

    expect(
      whoUses(workspace, { kind: "skill", id: "pitch", hub: null }).agents.map((each) => each.id),
    ).toEqual(["sales"]);
    const gmail = whoUses(workspace, { kind: "connector", id: "gmail", hub: null });
    expect(gmail.agents.map((each) => each.id)).toEqual(["support"]);
    expect(gmail.hubs.map((each) => each.id)).toEqual(["support"]);
    expect(gmail.routines).toEqual([{ id: "inbox", name: "Inbox", hub: "support" }]);
  });

  it("lists the collections with a ref field to a collection, never the collection itself", async () => {
    const workspace = await acme();

    const customers = whoUses(workspace, { kind: "collection", id: "customers", hub: null });
    expect(customers.collections.map((each) => each.id)).toEqual(["orders"]);
    expect(whoUses(workspace, { kind: "collection", id: "orders", hub: null }).collections).toEqual(
      [],
    );
  });

  it("keeps a hub's own item apart from a shared one with the same id", async () => {
    const workspace = await acme();

    const shared = whoUses(workspace, { kind: "skill", id: "triage", hub: null });
    expect(shared.agents.map((each) => each.id)).toEqual(["lead"]);
    const own = whoUses(workspace, { kind: "skill", id: "triage", hub: "support" });
    expect(own.agents.map((each) => each.id)).toEqual(["helper"]);
    expect(own.hubs).toEqual([]);
  });

  it("gives four empty lists for an item nobody uses", async () => {
    expect(whoUses(await acme(), { kind: "skill", id: "nobody", hub: null })).toEqual({
      agents: [],
      hubs: [],
      routines: [],
      collections: [],
    });
  });
});
