import { toolApproval, toolApprovalStoreContract } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MemoryToolApprovalStore } from "./tool-approval-store.ts";

toolApprovalStoreContract("memory", async () => {
  const store = new MemoryToolApprovalStore();
  return { store, damage: async (key) => store.damage(key) };
});

const lookup = { location: "/workspaces/acme", source: "notes", name: "lookup" };

verifies("memory.tool-approval-store", () => {
  it("makes a damaged approval unreadable, naming its key", async () => {
    const store = new MemoryToolApprovalStore();
    await store.approve(toolApproval());
    store.damage(lookup);
    await expect(store.get(lookup)).rejects.toThrow(
      'The approval for tool "lookup" of "notes" in "/workspaces/acme" can\'t be read.',
    );
  });

  it("refuses to damage a key it holds no approval for", async () => {
    const store = new MemoryToolApprovalStore();
    expect(() => store.damage(lookup)).toThrow(
      'There is no approval for tool "lookup" of "notes" in "/workspaces/acme" to damage.',
    );
    expect(await store.list("/workspaces/acme", "notes")).toEqual([]);
  });
});
