import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { agentTint } from "./agent-tint.ts";

verifies("messenger.agent-bubbles", () => {
  describe("agentTint", () => {
    it("gives an agent the same tint every time, from its ID alone", () => {
      const chief = { kind: "agent", agent: "agent-chief", name: "Chief" } as const;
      expect(agentTint(chief)).toBe(agentTint({ ...chief, name: "Chief (renamed)" }));
    });

    it("spreads agents over all six tints", () => {
      const tints = new Set(
        Array.from({ length: 60 }, (_, index) =>
          agentTint({ kind: "agent", agent: `agent-${index}`, name: "Acme" }),
        ),
      );
      expect([...tints].sort()).toEqual([
        "bg-agent-coral",
        "bg-agent-green",
        "bg-agent-indigo",
        "bg-agent-sand",
        "bg-agent-sky",
        "bg-agent-teal",
      ]);
    });
  });
});
