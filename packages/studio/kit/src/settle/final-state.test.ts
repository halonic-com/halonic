import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type CardEnder, finalState } from "./settle.tsx";

const at = new Date(2026, 10, 26, 14, 2).toISOString();
const ada = { kind: "agent", name: "Ada" } as const;
const option = (id: string) => ({ kind: "option", option: id }) as const;

verifies("kit.final-state", () => {
  describe("finalState", () => {
    it("says Approved, Rejected or Answered by the option, with who and when", () => {
      const answered = (answer: { kind: string; option?: string }, by: CardEnder = ada) =>
        finalState({ kind: "answered", by, answer, answeredAt: at });

      expect(answered(option("approve"))).toEqual({
        line: "Approved by Ada · 14:02",
        tone: "success",
      });
      expect(answered(option("accept")).line).toBe("Approved by Ada · 14:02");
      expect(answered(option("reject"), { kind: "me" })).toEqual({
        line: "Rejected by you · 14:02",
        tone: "danger",
      });
      expect(answered(option("friday")).line).toBe("Answered by Ada · 14:02");
      expect(answered({ kind: "reply" }).line).toBe("Answered by Ada · 14:02");
    });

    it("says how an action ended, in the success tone only when it succeeded", () => {
      const ended = (outcome: string) =>
        finalState({
          kind: "answered",
          by: { kind: "me" },
          answer: { kind: "action-result", outcome },
          answeredAt: at,
        });

      expect(ended("declined")).toEqual({ line: "Declined by you · 14:02", tone: "neutral" });
      expect(ended("failed")).toEqual({ line: "Failed by you · 14:02", tone: "danger" });
      expect(ended("expired")).toEqual({ line: "Expired by you · 14:02", tone: "neutral" });
      expect(ended("succeeded")).toEqual({ line: "Succeeded by you · 14:02", tone: "success" });
    });

    it("says Cancelled or Expired, naming who only when the source does", () => {
      expect(finalState({ kind: "closed", reason: "expired", closedAt: at })).toEqual({
        line: "Expired · 14:02",
        tone: "neutral",
      });
      expect(finalState({ kind: "closed", reason: "cancelled", closedAt: at, by: ada }).line).toBe(
        "Cancelled by Ada · 14:02",
      );
    });
  });
});
