import { agentPlacement } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MemoryAgentPlacementStore } from "./agent-placement-store.ts";

const coder = { location: "/workspaces/acme", agent: "coder" };

verifies("memory.agent-placement-store", () => {
  it("makes a damaged placement unreadable, naming its agent and location", async () => {
    const store = new MemoryAgentPlacementStore();
    await store.save(agentPlacement(coder.location, coder.agent));
    store.damage(coder);
    await expect(store.get(coder)).rejects.toThrow(
      'The placement for the agent "coder" in "/workspaces/acme" can\'t be read.',
    );
  });

  it("refuses to damage a placement it doesn't hold", async () => {
    const store = new MemoryAgentPlacementStore();
    expect(() => store.damage(coder)).toThrow(
      'There is no placement for the agent "coder" in "/workspaces/acme" to damage.',
    );
    expect(await store.get(coder)).toBeNull();
  });
});
