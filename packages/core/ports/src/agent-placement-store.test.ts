import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import {
  type AgentPlacementKey,
  type AgentPlacementRecord,
  type AgentPlacementStore,
  isAgentPlacementFor,
} from "./index.ts";

// Type tests: `tsc -p tsconfig.test.json` checks them. Each `@ts-expect-error`
// fails the typecheck if the line it marks ever starts to compile.

const placement: AgentPlacementRecord = {
  location: "/workspaces/acme",
  agent: "coder",
  runsOn: "this-computer",
  agentFingerprint: "sha256:00",
  chosenAt: "2026-11-09T10:00:00.000Z",
};

verifies("ports.agent-placement-store", () => {
  typeTest("only stores choices: get, save and remove", () => {
    expectTypeOf<keyof AgentPlacementStore>().toEqualTypeOf<"get" | "save" | "remove">();
    expectTypeOf<AgentPlacementStore["get"]>().parameters.toEqualTypeOf<[key: AgentPlacementKey]>();
    expectTypeOf<AgentPlacementStore["get"]>().returns.toEqualTypeOf<
      Promise<AgentPlacementRecord | null>
    >();
    expectTypeOf<AgentPlacementStore["save"]>().parameters.toEqualTypeOf<
      [placement: AgentPlacementRecord]
    >();
    expectTypeOf<AgentPlacementStore["remove"]>().parameters.toEqualTypeOf<
      [key: AgentPlacementKey]
    >();
  });

  it("holds only the choice to run on this computer, with the agent file's fingerprint", () => {
    // @ts-expect-error: a sandbox is what no record means, so a record can't say it
    const sandboxed: AgentPlacementRecord = { ...placement, runsOn: "sandbox" };
    // @ts-expect-error: a choice is tied to the agent file it was made for
    const unpinned: AgentPlacementRecord = { ...placement, agentFingerprint: undefined };
    // @ts-expect-error: a choice belongs to one agent
    const unkeyed: AgentPlacementRecord = { ...placement, agent: undefined };
    expect(placement.runsOn).toBe("this-computer");
    expect([sandboxed, unpinned, unkeyed]).toHaveLength(3);
  });
});

verifies("ports.agent-placement-store", () => {
  const key: AgentPlacementKey = { location: placement.location, agent: placement.agent };

  it("accepts a placement for the key it is asked about", () => {
    expect(isAgentPlacementFor(key, { ...placement })).toBe(true);
  });

  it.each([
    ["nothing", null],
    ["text", "this-computer"],
    ["an array", []],
    ["a choice other than this computer", { ...placement, runsOn: "sandbox" }],
    ["no fingerprint", { ...placement, agentFingerprint: undefined }],
    ["a fingerprint that isn't text", { ...placement, agentFingerprint: 42 }],
    ["a time that isn't text", { ...placement, chosenAt: 0 }],
    ["an extra field", { ...placement, sandbox: false }],
    ["another agent's key", { ...placement, agent: "writer" }],
    ["another workspace's key", { ...placement, location: "/workspaces/other" }],
  ])("refuses %s", (_kind, value) => {
    expect(isAgentPlacementFor(key, value)).toBe(false);
  });

  it("refuses a field it only inherits, even with the right number of fields", () => {
    const { chosenAt, ...rest } = placement;
    const inherited = Object.assign(Object.create({ chosenAt }), rest, { extra: "x" });
    expect(isAgentPlacementFor(key, inherited)).toBe(false);
  });
});
