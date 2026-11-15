import type {
  InstructionPin,
  InstructionTrustKey,
  InstructionTrustRecord,
  InstructionTrustStore,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";

/** One empty instruction trust store under test, and a way to damage what it holds. */
export interface InstructionTrustStoreHarness {
  store: InstructionTrustStore;
  /**
   * Makes the stored record for `key` unreadable, the way a damaged or
   * hand-edited file would be. The suite only damages records it saved.
   */
  damage(key: InstructionTrustKey): Promise<void>;
}

/** Creates an empty store under test. */
export type MakeInstructionTrustStore = () => Promise<InstructionTrustStoreHarness>;

/** A `sha256:` digest made of one hex character, so two digests are easy to tell apart. */
export function instructionDigest(character: string): string {
  return `sha256:${character.repeat(64)}`;
}

/** A pin of an `AGENTS.md` and one skill; `character` tells two versions apart. */
export function instructionPin(character = "a"): InstructionPin {
  return {
    digest: instructionDigest(character),
    files: {
      "AGENTS.md": instructionDigest("b"),
      "skills/review/SKILL.md": instructionDigest(character),
    },
  };
}

/** The trusted instructions for `agent` in `location`; `character` tells two pins apart. */
export function instructionTrustRecord(
  location: string,
  agent: string,
  character = "a",
): InstructionTrustRecord {
  return { location, agent, pin: instructionPin(character), grantedAt: "2026-11-15T10:00:00.000Z" };
}

/** The contract every {@link InstructionTrustStore} adapter passes. The port only stores; it decides nothing. */
export function instructionTrustStoreContract(name: string, make: MakeInstructionTrustStore): void {
  verifies("contracts.instruction-trust-store", () => {
    describe(`InstructionTrustStore contract: ${name}`, () => {
      storageCases(make);
      keyCases(make);
      hostileKeyCases(make);
      damageCases(make);
    });
  });
}

const acme = { location: "/workspaces/acme", agent: "coder" };

function storageCases(make: MakeInstructionTrustStore): void {
  it("starts empty, and gives back every field of a saved record", async () => {
    const { store } = await make();
    expect(await store.get(acme)).toBeNull();
    await store.save(instructionTrustRecord(acme.location, acme.agent));
    expect(await store.get(acme)).toEqual(instructionTrustRecord(acme.location, acme.agent));
  });

  it("replaces the record when the same agent is saved again", async () => {
    const { store } = await make();
    await store.save(instructionTrustRecord(acme.location, acme.agent, "a"));
    await store.save(instructionTrustRecord(acme.location, acme.agent, "c"));
    expect(await store.get(acme)).toEqual(instructionTrustRecord(acme.location, acme.agent, "c"));
  });

  it("keeps a pin with no files", async () => {
    const { store } = await make();
    const empty = {
      ...instructionTrustRecord(acme.location, acme.agent),
      pin: { digest: instructionDigest("d"), files: {} },
    };
    await store.save(empty);
    expect(await store.get(acme)).toEqual(empty);
  });

  it("removes a record, and removing one that isn't there is not an error", async () => {
    const { store } = await make();
    await store.save(instructionTrustRecord(acme.location, acme.agent));
    await store.remove(acme);
    expect(await store.get(acme)).toBeNull();
    await store.remove(acme);
    await store.remove({ location: "/workspaces/never", agent: "nobody" });
  });

  it("keeps what was saved, whatever the caller does with its objects later", async () => {
    const { store } = await make();
    const saved = instructionTrustRecord(acme.location, acme.agent);
    await store.save(saved);
    (saved.pin.files as Record<string, string>)["AGENTS.md"] = instructionDigest("e");
    saved.grantedAt = "2030-01-01T00:00:00.000Z";

    const read = await store.get(acme);
    expect(read).toEqual(instructionTrustRecord(acme.location, acme.agent));
    if (read !== null) (read.pin.files as Record<string, string>)["AGENTS.md"] = "changed";
    expect(await store.get(acme)).toEqual(instructionTrustRecord(acme.location, acme.agent));
  });
}

function keyCases(make: MakeInstructionTrustStore): void {
  it("keeps one record per location and agent, and doesn't let the two run into each other", async () => {
    const { store } = await make();
    // Joined with "/", these two keys would both read "/workspaces/a/b/c".
    const first = { location: "/workspaces/a", agent: "b/c" };
    const second = { location: "/workspaces/a/b", agent: "c" };
    await store.save(instructionTrustRecord(first.location, first.agent, "a"));
    expect(await store.get(second)).toBeNull();

    await store.save(instructionTrustRecord(second.location, second.agent, "c"));
    await store.remove(second);
    expect(await store.get(first)).toEqual(
      instructionTrustRecord(first.location, first.agent, "a"),
    );
  });

  it("compares locations and agent ids exactly as given", async () => {
    const { store } = await make();
    await store.save(instructionTrustRecord(acme.location, acme.agent));
    // The service resolves the real path first; the store must not guess.
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

/**
 * Keys an agent's author or a hostile workspace could pick. Each one is saved
 * next to a key it could be mistaken for, and neither may answer for the other.
 */
const lookalikes: ReadonlyArray<readonly [string, InstructionTrustKey, InstructionTrustKey]> = [
  [
    "an agent id climbing out with ..",
    { location: "/workspaces/acme", agent: "../../trust/coder" },
    { location: "/workspaces/trust", agent: "coder" },
  ],
  [
    "a NUL in the agent id",
    { location: "/workspaces/acme", agent: "coder\u0000writer" },
    { location: "/workspaces/acme", agent: "coder" },
  ],
  [
    "a location ending in / against an agent id starting with one",
    { location: "/a/", agent: "b" },
    { location: "/a", agent: "/b" },
  ],
  [
    "a composed é against a decomposed one",
    { location: "/workspaces/café", agent: "coder" },
    { location: "/workspaces/café", agent: "coder" },
  ],
  [
    "agent ids that differ only in case",
    { location: "/workspaces/acme", agent: "CODER" },
    { location: "/workspaces/acme", agent: "coder" },
  ],
  [
    "two lone surrogates",
    { location: "/workspaces/acme", agent: "\ud800" },
    { location: "/workspaces/acme", agent: "\udc00" },
  ],
];

function hostileKeyCases(make: MakeInstructionTrustStore): void {
  it.each(lookalikes)("keeps %s apart", async (_kind, first, second) => {
    const { store } = await make();
    await store.save(instructionTrustRecord(first.location, first.agent, "a"));
    expect(await store.get(first)).toEqual(
      instructionTrustRecord(first.location, first.agent, "a"),
    );
    expect(await store.get(second)).toBeNull();

    await store.save(instructionTrustRecord(second.location, second.agent, "c"));
    await store.remove(second);
    expect(await store.get(first)).toEqual(
      instructionTrustRecord(first.location, first.agent, "a"),
    );
    expect(await store.get(second)).toBeNull();
  });
}

function damageCases(make: MakeInstructionTrustStore): void {
  it("throws on a damaged record, naming its key, and still removes it", async () => {
    const harness = await make();
    await harness.store.save(instructionTrustRecord(acme.location, acme.agent));
    await harness.damage(acme);

    // Never null: a person must be asked, not trusted, and told why.
    await expect(harness.store.get(acme)).rejects.toThrow("/workspaces/acme");
    await expect(harness.store.get(acme)).rejects.toThrow("coder");
    await harness.store.remove(acme);
    expect(await harness.store.get(acme)).toBeNull();
  });

  it("reads a record again once it is saved over the damaged one", async () => {
    const harness = await make();
    await harness.store.save(instructionTrustRecord(acme.location, acme.agent, "a"));
    await harness.damage(acme);
    await harness.store.save(instructionTrustRecord(acme.location, acme.agent, "c"));
    expect(await harness.store.get(acme)).toEqual(
      instructionTrustRecord(acme.location, acme.agent, "c"),
    );
  });

  it("damages one agent's record and leaves another's readable", async () => {
    const harness = await make();
    const other = { location: acme.location, agent: "writer" };
    await harness.store.save(instructionTrustRecord(acme.location, acme.agent));
    await harness.store.save(instructionTrustRecord(other.location, other.agent, "c"));
    await harness.damage(acme);

    expect(await harness.store.get(other)).toEqual(
      instructionTrustRecord(other.location, other.agent, "c"),
    );
  });
}
