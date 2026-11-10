import type { AgentPlacementKey, AgentPlacementStore, Clock, Digest } from "@halonicjs/ports";
import { encodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import {
  AgentPlacement,
  agentFingerprint,
  type PlacementReader,
  type PlacementSubject,
} from "./agent-placement.ts";
import { TestAgentPlacementStore } from "./testing/test-agent-placement-store.ts";

/** SHA-256 from Web Crypto, as the platform's `Digest` adapter gives it. */
const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};

const coder: AgentPlacementKey = { location: "/workspaces/acme", agent: "coder" };
const coderFile = "kind: agent\nid: coder\nharness: claude-code\n";

function subject(file: string, key: AgentPlacementKey = coder): PlacementSubject {
  return { ...key, file: encodeUtf8(file) };
}

/** A clock that reads whatever time the test last set. */
function fixedClock(iso: string): Clock & { set(iso: string): void } {
  let current = iso;
  return {
    now: () => new Date(current),
    set: (next) => {
      current = next;
    },
  };
}

function setup() {
  const store = new TestAgentPlacementStore();
  const clock = fixedClock("2026-11-10T10:00:00.000Z");
  const placement = new AgentPlacement({ store, digest, clock });
  return { store, clock, placement };
}

/** Chooses "this computer" for the file, the way a person does: with the fingerprint they were shown. */
async function chooseThisComputer(placement: AgentPlacement, file: string): Promise<void> {
  const shown = await placement.where(subject(file));
  const chosen = await placement.chooseThisComputer(subject(file), shown.agentFingerprint);
  expect(chosen).toEqual({ ok: true, value: undefined });
}

verifies("app.agent-placement", () => {
  it("fingerprints the raw bytes of the agent's file with SHA-256", async () => {
    expect(await agentFingerprint(encodeUtf8("abc"), digest)).toBe(
      "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("runs an agent nobody chose for in a sandbox", async () => {
    const { placement } = setup();

    expect(await placement.where(subject(coderFile))).toEqual({
      runsOn: "sandbox",
      agentFingerprint: await agentFingerprint(encodeUtf8(coderFile), digest),
      reason: "not-chosen",
    });
  });

  it("runs the agent on this computer once a person chose it for the file as it is", async () => {
    const { store, placement } = setup();
    await chooseThisComputer(placement, coderFile);

    const fingerprint = await agentFingerprint(encodeUtf8(coderFile), digest);
    expect(await placement.where(subject(coderFile))).toEqual({
      runsOn: "this-computer",
      agentFingerprint: fingerprint,
      chosenAt: "2026-11-10T10:00:00.000Z",
    });
    expect(await store.get(coder)).toEqual({
      ...coder,
      runsOn: "this-computer",
      agentFingerprint: fingerprint,
      chosenAt: "2026-11-10T10:00:00.000Z",
    });
  });

  it("keeps the choice to the agent and workspace it was made for", async () => {
    const { placement } = setup();
    await chooseThisComputer(placement, coderFile);

    const otherAgent = await placement.where(subject(coderFile, { ...coder, agent: "writer" }));
    const otherWorkspace = await placement.where(
      subject(coderFile, { ...coder, location: "/workspaces/beta" }),
    );
    expect(otherAgent.runsOn).toBe("sandbox");
    expect(otherWorkspace.runsOn).toBe("sandbox");
  });

  it("counts a choice made for an earlier version of the file as no choice", async () => {
    const { placement } = setup();
    await chooseThisComputer(placement, coderFile);
    const pulled = `${coderFile}allowedSites: [example.com]\n`;

    expect(await placement.where(subject(pulled))).toEqual({
      runsOn: "sandbox",
      agentFingerprint: await agentFingerprint(encodeUtf8(pulled), digest),
      reason: "file-changed",
    });
  });

  it("asks again after an edit that only changes whitespace", async () => {
    const { placement } = setup();
    await chooseThisComputer(placement, coderFile);

    const answer = await placement.where(subject(coderFile.replace("id: coder", "id:  coder")));
    expect(answer).toMatchObject({ runsOn: "sandbox", reason: "file-changed" });
  });

  it("runs the agent on this computer again once the person confirms the changed file", async () => {
    const { placement } = setup();
    await chooseThisComputer(placement, coderFile);
    const pulled = `${coderFile}allowedSites: [example.com]\n`;

    await chooseThisComputer(placement, pulled);

    expect((await placement.where(subject(pulled))).runsOn).toBe("this-computer");
    expect((await placement.where(subject(coderFile))).runsOn).toBe("sandbox");
  });

  it("refuses a choice for a fingerprint other than the file's now, and saves nothing", async () => {
    const { store, placement } = setup();
    const shown = await placement.where(subject(coderFile));
    const changed = `${coderFile}workingFolder: .\n`;

    const chosen = await placement.chooseThisComputer(subject(changed), shown.agentFingerprint);

    expect(chosen).toEqual({
      ok: false,
      error: {
        kind: "fingerprint-changed",
        agentFingerprint: await agentFingerprint(encodeUtf8(changed), digest),
      },
    });
    expect(store.saves).toEqual([]);
    expect((await placement.where(subject(changed))).runsOn).toBe("sandbox");
  });

  it("runs the agent in a sandbox when its choice can't be read, and gives the error", async () => {
    const { store, placement } = setup();
    await chooseThisComputer(placement, coderFile);
    store.breakPlacement(coder);

    const answer = await placement.where(subject(coderFile));

    expect(answer).toMatchObject({ runsOn: "sandbox", reason: "unreadable" });
    expect(answer.runsOn === "sandbox" && answer.error).toBeInstanceOf(Error);
  });

  it("puts the agent back in a sandbox, even when its choice can't be read", async () => {
    const { store, placement } = setup();
    await chooseThisComputer(placement, coderFile);
    store.breakPlacement(coder);

    await placement.chooseSandbox(coder);

    expect(await placement.where(subject(coderFile))).toMatchObject({
      runsOn: "sandbox",
      reason: "not-chosen",
    });
  });

  it("puts nothing but the key in the store, never the file's bytes", async () => {
    const { store, placement } = setup();
    await chooseThisComputer(placement, coderFile);

    expect(Object.keys(store.saves[0] ?? {}).sort()).toEqual([
      "agent",
      "agentFingerprint",
      "chosenAt",
      "location",
      "runsOn",
    ]);
  });

  it("gives the engine a side that can't make a choice", () => {
    expectTypeOf<keyof PlacementReader>().toEqualTypeOf<"where">();
    expectTypeOf<keyof AgentPlacement>().toEqualTypeOf<
      "where" | "chooseThisComputer" | "chooseSandbox"
    >();
    const methods = Object.getOwnPropertyNames(AgentPlacement.prototype).filter(
      (name) => name !== "constructor",
    );
    expect(methods.sort()).toEqual(["chooseSandbox", "chooseThisComputer", "where"]);
  });
});

// A store that hands back a damaged or borrowed choice must never end in
// "this computer" (Julian, HAL-2927).
verifies("app.agent-placement", () => {
  /** An `AgentPlacement` over a store whose `get` gives whatever `read` gives. */
  function over(read: () => Promise<unknown>): AgentPlacement {
    const store: AgentPlacementStore = {
      get: read as AgentPlacementStore["get"],
      save: async () => {},
      remove: async () => {},
    };
    return new AgentPlacement({ store, digest, clock: fixedClock("2026-11-10T10:00:00.000Z") });
  }

  /** A choice for `coderFile` as it is now, with `change` laid over it. */
  async function choice(change: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    return {
      ...coder,
      runsOn: "this-computer",
      agentFingerprint: await agentFingerprint(encodeUtf8(coderFile), digest),
      chosenAt: "2026-11-10T10:00:00.000Z",
      ...change,
    };
  }

  it.each([
    ["no fingerprint", { agentFingerprint: undefined }],
    ["a fingerprint that isn't text", { agentFingerprint: 1 }],
    ["a fingerprint of only its prefix", { agentFingerprint: "sha256:" }],
  ])("runs the agent in a sandbox when its choice has %s", async (_kind, change) => {
    const placement = over(async () => choice(change));

    expect((await placement.where(subject(coderFile))).runsOn).toBe("sandbox");
  });

  it("runs the agent in a sandbox when the store throws something that isn't an Error", async () => {
    const placement = over(() => Promise.reject("not an error"));

    expect(await placement.where(subject(coderFile))).toMatchObject({
      runsOn: "sandbox",
      reason: "unreadable",
      error: "not an error",
    });
  });

  // Not only the fingerprint: a record that says "sandbox", or one the store
  // hands back for another agent, must not let the agent out either.
  it.each([
    ["a choice other than this computer", { runsOn: "sandbox" }],
    ["another agent's key", { agent: "writer" }],
    ["another workspace's key", { location: "/workspaces/other" }],
  ])("runs the agent in a sandbox when the store gives back %s", async (_kind, change) => {
    const placement = over(async () => choice(change));

    expect((await placement.where(subject(coderFile))).runsOn).toBe("sandbox");
  });
});
