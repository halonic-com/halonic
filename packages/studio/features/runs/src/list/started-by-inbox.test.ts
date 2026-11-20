import type { RunTrigger } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { detailRows } from "../run-view/details-model.ts";
import { minutesLater, mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { runRow, startedBy } from "./run-row.ts";

const workflow = { name: "Support reply", stepDescription: () => undefined };
const fromInbox = { summary: summaryWith({ trigger: { type: "inbox", at: minutesLater(0) } }) };

verifies("runs.started-by-inbox", () => {
  it("says the person started it in the Inbox, in the column and the sentence", () => {
    const row = runRow(fromInbox, {
      workflow,
      routine: undefined,
      currency: "EUR",
      now: mondayMorning,
    });

    expect(row.startedBy).toBe("You, in the Inbox");
    expect(row.label.endsWith("Started by you, in the Inbox, 10:40.")).toBe(true);
  });

  it("says it on the run page and the Inbox card too", () => {
    const context = {
      workflow,
      workflowOfRun: () => undefined,
      providerKind: () => undefined,
      currency: "EUR",
      now: mondayMorning,
    };

    expect(detailRows(fromInbox, context, undefined)[0]).toEqual({
      label: "Started by",
      value: "You, in the Inbox",
    });
    expect(startedBy(fromInbox, undefined).spoken).toBe("you, in the Inbox");
  });

  it("still shows a run whose trigger this Studio doesn't know, as one started with Run", () => {
    // A run log from a newer Halonic, read as it comes off the disk.
    const trigger = { type: "voice", at: minutesLater(0) } as unknown as RunTrigger;
    const row = runRow(
      { summary: summaryWith({ trigger }) },
      { workflow, routine: undefined, currency: "EUR", now: mondayMorning },
    );

    expect(row.startedBy).toBe("You, with Run");
  });
});
