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

/** A full placement for the agent of `key`; `agentFingerprint` tells two versions of its file apart. */
export function agentPlacement(
  key: AgentPlacementKey,
  agentFingerprint = "sha256:aa",
): AgentPlacementRecord {
  return {
    location: key.location,
    hub: key.hub,
    agent: key.agent,
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
      hostileKeyCases(make);
      damageCases(make);
    });
  });
}

const acme = { location: "/workspaces/acme", hub: "support", agent: "coder" };

function storageCases(make: MakeAgentPlacementStore): void {
  it("starts empty, and gives back every field of a saved placement", async () => {
    const { store } = await make();
    expect(await store.get(acme)).toBeNull();
    await store.save(agentPlacement(acme));
    expect(await store.get(acme)).toEqual(agentPlacement(acme));
  });

  it("replaces the placement when the same agent is saved again", async () => {
    const { store } = await make();
    await store.save(agentPlacement(acme, "sha256:old"));
    await store.save(agentPlacement(acme, "sha256:new"));
    expect(await store.get(acme)).toEqual(agentPlacement(acme, "sha256:new"));
  });

  it("removes a placement, and removing one that isn't there is not an error", async () => {
    const { store } = await make();
    await store.save(agentPlacement(acme));
    await store.remove(acme);
    expect(await store.get(acme)).toBeNull();
    await store.remove(acme);
    await store.remove({ location: "/workspaces/never", hub: "support", agent: "nobody" });
  });

  it("keeps what was saved, whatever the caller does with its objects later", async () => {
    const { store } = await make();
    const saved = agentPlacement(acme);
    await store.save(saved);
    saved.agentFingerprint = "sha256:changed";

    const read = await store.get(acme);
    expect(read).toEqual(agentPlacement(acme));
    if (read !== null) read.agentFingerprint = "sha256:changed";
    expect(await store.get(acme)).toEqual(agentPlacement(acme));
  });
}

function keyCases(make: MakeAgentPlacementStore): void {
  it("keeps the same agent id in two hubs of one workspace apart (Julian, HAL-13203)", async () => {
    const { store } = await make();
    const other = { ...acme, hub: "billing" };
    await store.save(agentPlacement(acme, "sha256:same"));
    expect(await store.get(other)).toBeNull();

    await store.save(agentPlacement(other, "sha256:same"));
    await store.remove(other);
    expect(await store.get(acme)).toEqual(agentPlacement(acme, "sha256:same"));
  });

  it("keeps one placement per location and agent, and doesn't let the two run into each other", async () => {
    const { store } = await make();
    // Joined with "/", these two keys would both read "/workspaces/a/b/c".
    const first = { location: "/workspaces/a", hub: "support", agent: "b/c" };
    const second = { location: "/workspaces/a/b", hub: "support", agent: "c" };
    await store.save(agentPlacement(first, "sha256:first"));
    expect(await store.get(second)).toBeNull();

    await store.save(agentPlacement(second, "sha256:second"));
    await store.remove(second);
    expect(await store.get(first)).toEqual(agentPlacement(first, "sha256:first"));
  });

  it("compares locations, hub ids and agent ids exactly as given", async () => {
    const { store } = await make();
    await store.save(agentPlacement(acme));
    // AgentPlacement resolves the real path first; the store must not guess.
    const others = [
      { location: "/workspaces/acme/", hub: "support", agent: "coder" },
      { location: "/Workspaces/acme", hub: "support", agent: "coder" },
      { location: "/workspaces/acme", hub: "support", agent: "Coder" },
      { location: "/workspaces/acme", hub: "Support", agent: "coder" },
    ];
    for (const other of others) {
      expect(await store.get(other), JSON.stringify(other)).toBeNull();
    }
  });
}

/**
 * Keys an agent's author or a hostile workspace could pick (Julian,
 * HAL-2927). Each one is saved next to a key it could be mistaken for, and
 * neither may answer for the other.
 */
const lookalikes: ReadonlyArray<readonly [string, AgentPlacementKey, AgentPlacementKey]> = [
  [
    "an agent id climbing out with ..",
    { location: "/workspaces/acme", hub: "support", agent: "../../trust/coder" },
    { location: "/workspaces/trust", hub: "support", agent: "coder" },
  ],
  [
    "an agent id of only ..",
    { location: "/workspaces/acme/sub", hub: "support", agent: ".." },
    { location: "/workspaces/acme", hub: "support", agent: "sub" },
  ],
  [
    "a NUL in the agent id",
    { location: "/workspaces/acme", hub: "support", agent: "coder\u0000writer" },
    { location: "/workspaces/acme", hub: "support", agent: "coder" },
  ],
  [
    "a NUL in the location",
    { location: "/workspaces/acme\u0000/evil", hub: "support", agent: "coder" },
    { location: "/workspaces/acme", hub: "support", agent: "coder" },
  ],
  [
    "a location ending in / against a hub id starting with one",
    { location: "/a/", hub: "b", agent: "coder" },
    { location: "/a", hub: "/b", agent: "coder" },
  ],
  [
    "a hub id ending in / against an agent id starting with one",
    { location: "/workspaces/acme", hub: "support/", agent: "coder" },
    { location: "/workspaces/acme", hub: "support", agent: "/coder" },
  ],
  [
    "a hub id climbing out with ..",
    { location: "/workspaces/acme", hub: "../other", agent: "coder" },
    { location: "/workspaces/other", hub: "support", agent: "coder" },
  ],
  [
    "a composed é against a decomposed one",
    { location: "/workspaces/café", hub: "support", agent: "coder" },
    { location: "/workspaces/café", hub: "support", agent: "coder" },
  ],
  [
    "a Cyrillic о against a Latin o",
    { location: "/workspaces/acme", hub: "support", agent: "cоder" },
    { location: "/workspaces/acme", hub: "support", agent: "coder" },
  ],
  [
    "agent ids that differ only in case",
    { location: "/workspaces/acme", hub: "support", agent: "CODER" },
    { location: "/workspaces/acme", hub: "support", agent: "coder" },
  ],
  [
    "two lone surrogates",
    { location: "/workspaces/acme", hub: "support", agent: "\ud800" },
    { location: "/workspaces/acme", hub: "support", agent: "\udc00" },
  ],
  [
    "a very long agent id against its own start",
    { location: "/workspaces/acme", hub: "support", agent: "a".repeat(10_000) },
    { location: "/workspaces/acme", hub: "support", agent: "a".repeat(9_999) },
  ],
];

function hostileKeyCases(make: MakeAgentPlacementStore): void {
  it.each(lookalikes)("keeps %s apart", async (_kind, first, second) => {
    const { store } = await make();
    await store.save(agentPlacement(first, "sha256:first"));
    expect(await store.get(first)).toEqual(agentPlacement(first, "sha256:first"));
    expect(await store.get(second)).toBeNull();

    await store.save(agentPlacement(second, "sha256:second"));
    await store.remove(second);
    expect(await store.get(first)).toEqual(agentPlacement(first, "sha256:first"));
    expect(await store.get(second)).toBeNull();
  });
}

function damageCases(make: MakeAgentPlacementStore): void {
  it("throws on a damaged placement, naming its key, and still removes it", async () => {
    const harness = await make();
    await harness.store.save(agentPlacement(acme));
    await harness.damage(acme);

    await expect(harness.store.get(acme)).rejects.toThrow("/workspaces/acme");
    await expect(harness.store.get(acme)).rejects.toThrow("coder");
    await harness.store.remove(acme);
    expect(await harness.store.get(acme)).toBeNull();
  });

  it("reads a placement again once it is saved over the damaged one", async () => {
    const harness = await make();
    await harness.store.save(agentPlacement(acme, "sha256:old"));
    await harness.damage(acme);
    await harness.store.save(agentPlacement(acme, "sha256:new"));
    expect(await harness.store.get(acme)).toEqual(agentPlacement(acme, "sha256:new"));
  });
}
