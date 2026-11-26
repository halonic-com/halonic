import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { agentTint } from "./agent-tint.ts";

verifies("kit.agent-tint", () => {
  describe("agentTint", () => {
    it("gives a key the same tint every time", () => {
      expect(agentTint("agent-chief")).toBe(agentTint("agent-chief"));
    });

    it("spreads keys over all six tints", () => {
      const tints = new Set(Array.from({ length: 60 }, (_, index) => agentTint(`agent-${index}`)));
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
