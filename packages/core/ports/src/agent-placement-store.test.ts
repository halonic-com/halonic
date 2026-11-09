import { typeTest, verifies } from "@halonicjs/testing-spec";
import { expect, expectTypeOf, it } from "vitest";
import type { AgentPlacementKey, AgentPlacementRecord, AgentPlacementStore } from "./index.ts";

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
