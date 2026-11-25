import type { RunTrigger } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { minutesLater, mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { runRow } from "./run-row.ts";
import { startedByYou } from "./started-by-you.ts";

const at = minutesLater(0);
const routineId = "acme/morning-brief";

const triggers: readonly (RunTrigger | null)[] = [
  null,
  { type: "manual", at },
  { type: "manual", at, routineId },
  { type: "inbox", at },
  { type: "schedule", at, routineId },
  { type: "every", at, routineId },
  { type: "mail", at, messageId: "m1" },
  { type: "signal", at, signalId: "run_1:4" },
  { type: "webhook", at, deliveryId: "d-1" },
];

verifies("runs.run-notifications", () => {
  describe("startedByYou", () => {
    it("counts Run, Run now, the Inbox and the terminal as the person's own runs", () => {
      const started = triggers.map((trigger) => [
        trigger?.type ?? "terminal",
        startedByYou({ trigger, parentRunId: null }),
      ]);
      expect(started).toEqual([
        ["terminal", true],
        ["manual", true],
        ["manual", true],
        ["inbox", true],
        ["schedule", false],
        ["every", false],
        ["mail", false],
        ["signal", false],
        ["webhook", false],
      ]);
    });

    it("never counts a run another run started", () => {
      const child = { trigger: { type: "manual", at } as const, parentRunId: "run_1" };
      expect(startedByYou(child)).toBe(false);
    });

    it("agrees with the row's Started by: You, or a routine with Run now", () => {
      for (const trigger of triggers) {
        const summary = summaryWith({ trigger });
        const row = runRow(
          { summary },
          {
            workflow: undefined,
            routine: { name: "Morning brief", schedule: "Weekdays at 08:00" },
            currency: "EUR",
            now: mondayMorning,
          },
        );
        const saysYou = row.startedBy.startsWith("You") || row.startedBy.endsWith("with Run now");
        expect(saysYou, row.startedBy).toBe(startedByYou(summary));
      }
    });
  });
});
