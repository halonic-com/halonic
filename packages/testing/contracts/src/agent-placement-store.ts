import type {
  AgentPlacementKey,
  AgentPlacementRecord,
  AgentPlacementStore,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/** One empty placement store under test, and a way to damage what it holds. */
export interface AgentPlacementStoreHarness {
  store: AgentPlacementStore;
  /**
   * Makes the stored placement for `key` unreadable, the way a damaged or
   * hand-edited file would be. The suite only damages placements it saved.
   */
  damage(key: AgentPlacementKey): Promise<void>;
}

/** Creates an empty store under test. */
export type MakeAgentPlacementStore = () => Promise<AgentPlacementStoreHarness>;

/** A full placement for `agent` in `location`; `agentFingerprint` tells two versions of its file apart. */
export function agentPlacement(
  location: string,
  agent: string,
  agentFingerprint = "sha256:aa",
): AgentPlacementRecord {
  return {
    location,
    agent,
    runsOn: "this-computer",
    agentFingerprint,
    chosenAt: "2026-11-09T10:00:00.000Z",
  };
}

/** The contract every {@link AgentPlacementStore} adapter passes. The port only stores; it decides nothing. */
export function agentPlacementStoreContract(name: string, make: MakeAgentPlacementStore): void {
  verifies("contracts.agent-placement-store", () => {
    describe(`AgentPlacementStore contract: ${name}`, () => {
      storageCases(make);
      keyCases(make);
      damageCases(make);
    });
  });
}

const acme = { location: "/workspaces/acme", agent: "coder" };

function storageCases(make: MakeAgentPlacementStore): void {
  it("starts empty, and gives back every field of a saved placement", async () => {
    const { store } = await make();
    expect(await store.get(acme)).toBeNull();
    await store.save(agentPlacement(acme.location, acme.agent));
    expect(await store.get(acme)).toEqual(agentPlacement(acme.location, acme.agent));
  });

  it("replaces the placement when the same agent is saved again", async () => {
    const { store } = await make();
    await store.save(agentPlacement(acme.location, acme.agent, "sha256:old"));
    await store.save(agentPlacement(acme.location, acme.agent, "sha256:new"));
    expect(await store.get(acme)).toEqual(agentPlacement(acme.location, acme.agent, "sha256:new"));
  });

  it("removes a placement, and removing one that isn't there is not an error", async () => {
    const { store } = await make();
    await store.save(agentPlacement(acme.location, acme.agent));
    await store.remove(acme);
    expect(await store.get(acme)).toBeNull();
    await store.remove(acme);
    await store.remove({ location: "/workspaces/never", agent: "nobody" });
  });

  it("keeps what was saved, whatever the caller does with its objects later", async () => {
    const { store } = await make();
    const saved = agentPlacement(acme.location, acme.agent);
    await store.save(saved);
    saved.agentFingerprint = "sha256:changed";

    const read = await store.get(acme);
    expect(read).toEqual(agentPlacement(acme.location, acme.agent));
    if (read !== null) read.agentFingerprint = "sha256:changed";
    expect(await store.get(acme)).toEqual(agentPlacement(acme.location, acme.agent));
  });
}

function keyCases(make: MakeAgentPlacementStore): void {
  it("keeps one placement per location and agent, and doesn't let the two run into each other", async () => {
    const { store } = await make();
    // Joined with "/", these two keys would both read "/workspaces/a/b/c".
    const first = { location: "/workspaces/a", agent: "b/c" };
    const second = { location: "/workspaces/a/b", agent: "c" };
    await store.save(agentPlacement(first.location, first.agent, "sha256:first"));
    expect(await store.get(second)).toBeNull();

    await store.save(agentPlacement(second.location, second.agent, "sha256:second"));
    await store.remove(second);
    expect(await store.get(first)).toEqual(
      agentPlacement(first.location, first.agent, "sha256:first"),
    );
  });

  it("compares locations and agent ids exactly as given", async () => {
    const { store } = await make();
    await store.save(agentPlacement(acme.location, acme.agent));
    // AgentPlacement resolves the real path first; the store must not guess.
    const others = [
      { location: "/workspaces/acme/", agent: "coder" },
      { location: "/Workspaces/acme", agent: "coder" },
      { location: "/workspaces/acme", agent: "Coder" },
    ];
    for (const other of others) {
      expect(await store.get(other), JSON.stringify(other)).toBeNull();
    }
  });
}

function damageCases(make: MakeAgentPlacementStore): void {
  it("throws on a damaged placement, naming its key, and still removes it", async () => {
    const harness = await make();
    await harness.store.save(agentPlacement(acme.location, acme.agent));
    await harness.damage(acme);

    await expect(harness.store.get(acme)).rejects.toThrow("/workspaces/acme");
    await expect(harness.store.get(acme)).rejects.toThrow("coder");
    await harness.store.remove(acme);
    expect(await harness.store.get(acme)).toBeNull();
  });

  it("reads a placement again once it is saved over the damaged one", async () => {
    const harness = await make();
    await harness.store.save(agentPlacement(acme.location, acme.agent, "sha256:old"));
    await harness.damage(acme);
    await harness.store.save(agentPlacement(acme.location, acme.agent, "sha256:new"));
    expect(await harness.store.get(acme)).toEqual(
      agentPlacement(acme.location, acme.agent, "sha256:new"),
    );
  });
}
