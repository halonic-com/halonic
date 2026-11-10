import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Message } from "./define.ts";
import { dim, plainText } from "./phrase.ts";
import {
  endedInWords,
  runsListMessages as list,
  type StatusFilter,
  statusYouMeant,
} from "./runs-list.ts";

const words = (message: Message) => plainText(message.phrase);

verifies("cli.messages", () => {
  it("has the list's rows word for word, from cli-output 3.4", () => {
    const row = (...columns: readonly Message[]) => columns.map(words).join(" | ");
    expect(list.status("done").key).toBe("runsList.status");
    expect([
      row(
        list.status("running"),
        list.inStep("Draft a reply"),
        list.when({ day: "today", time: "10:53" }),
      ),
      row(
        list.status("needsYou"),
        list.waitingForYou("Approve this reply?"),
        list.when({ day: "today", time: "10:40" }),
      ),
      row(
        list.status("done"),
        list.estimatedCost("€0.004"),
        list.when({ day: "today", time: "10:31" }, "18 s"),
      ),
      row(
        list.status("stopped"),
        list.budgetReached("Draft a reply"),
        list.when({ day: "today", time: "07:12" }, "3 min"),
      ),
      row(
        list.status("failed"),
        list.inStep("Classify it"),
        list.when({ day: "yesterday", time: "16:40" }, "1 min"),
      ),
    ]).toEqual([
      "◌ Running | In Draft a reply | 10:53",
      "! Needs you | Waiting for you: Approve this reply? | 10:40",
      "✓ Done | Estimated cost €0.004 | 10:31 · took 18 s",
      "✕ Stopped | Budget reached in Draft a reply | 07:12 · took 3 min",
      "✕ Failed | In Classify it | yesterday 16:40 · took 1 min",
    ]);
  });

  it("never leaves a Done row's What column empty (revision 32)", () => {
    expect(
      [
        list.sentNothing("€0.02"),
        list.sentNothing(),
        list.estimatedCost("€0.004"),
        list.finishedIn("Send reply"),
      ].map((message) => plainText(message.phrase)),
    ).toEqual([
      "Sent nothing · estimated cost €0.02",
      "Sent nothing",
      "Estimated cost €0.004",
      "Finished in Send reply",
    ]);
  });

  it("has the line for runs that --limit leaves out, with the user's filters", () => {
    expect(list.leftOut(20, 47, { status: "failed" }).phrase).toEqual([
      dim(
        "Showing the 20 newest of 47 failed runs. See them all with halonic runs --status failed --limit 47.",
      ),
    ]);
    expect(words(list.leftOut(20, 47, {}))).toBe(
      "Showing the 20 newest of 47 runs. See them all with halonic runs --limit 47.",
    );
  });

  it("has the lines for no runs and for filters that match nothing", () => {
    expect(words(list.noRunsYet("acme"))).toBe(
      "No runs in acme yet. Start one with halonic run <workflow>.",
    );
    expect(words(list.onlyTestRuns("acme"))).toBe(
      "No runs in acme yet, only test runs. Start one with halonic run <workflow>.",
    );
    expect(words(list.noMatch({ status: "failed", workflow: "support-reply" }, "acme"))).toBe(
      "No failed runs of support-reply in acme.",
    );
    expect(list.seeEveryRun().phrase).toEqual([dim("See every run with halonic runs.")]);
  });
});

describe("when a run ended, in words", () => {
  it("writes the minutes out within the hour, else the time as runs show does", () => {
    expect([
      endedInWords({ day: "withinTheHour", minutes: 1 }),
      endedInWords({ day: "withinTheHour", minutes: 2 }),
      endedInWords({ day: "today", time: "10:31" }),
      endedInWords({ day: "yesterday", time: "16:40" }),
    ]).toEqual(["1 minute ago", "2 minutes ago", "at 10:31", "yesterday at 16:40"]);
  });
});

describe("the runs list's sentences", () => {
  it("names every status with its mark", () => {
    expect(
      (["running", "needsYou", "waiting", "done", "failed", "stopped", "couldntTry"] as const).map(
        (status) => words(list.status(status)),
      ),
    ).toEqual([
      "◌ Running",
      "! Needs you",
      "◌ Waiting",
      "✓ Done",
      "✕ Failed",
      "✕ Stopped",
      "! Couldn't try",
    ]);
  });

  it("says what each kind of run is doing or did", () => {
    expect([
      words(list.waitingInStep("Review")),
      words(list.waitingForApproval("Draft a reply")),
      words(list.waitingUntil({ day: "today", time: "14:00" })),
      words(list.waitingUntil({ day: "tomorrow", time: "08:00" })),
      words(list.waitingUntil({ day: "later", date: { day: 3, month: 12 }, time: "08:00" })),
      words(list.waitingForChildRun("7k2m9p")),
      words(list.waitingIn("Classify it")),
      words(list.cancelledIn("Draft a reply")),
    ]).toEqual([
      "Waiting for you in the step Review",
      "Waiting for your approval in the step Draft a reply",
      "Waiting until 14:00",
      "Waiting until tomorrow 08:00",
      "Waiting until 3 Dec 08:00",
      "Waiting for child run 7k2m9p",
      "Waiting in Classify it",
      "Cancelled in Draft a reply",
    ]);
  });

  it("writes a start this year and before it with the day and month", () => {
    expect(words(list.when({ day: "thisYear", date: { day: 3, month: 11 }, time: "14:05" }))).toBe(
      "3 Nov 14:05",
    );
    expect(
      words(list.when({ day: "earlier", date: { day: 3, month: 11 }, year: 2025 }, "2 min")),
    ).toBe("3 Nov 2025 · took 2 min");
    expect(words(list.when({ day: "earlier", date: { day: 1, month: 1 }, year: 2025 }))).toBe(
      "1 Jan 2025",
    );
  });

  it("keeps every filter and the user's --dir in the command that shows them all", () => {
    expect(
      words(list.leftOut(20, 47, { status: "waiting", workflow: "support-reply" }, "./acme")),
    ).toBe(
      "Showing the 20 newest of 47 runs of support-reply waiting for you. See them all with halonic runs --dir ./acme --status waiting --workflow support-reply --limit 47.",
    );
    expect(words(list.leftOut(1, 3, { status: "running" }))).toBe(
      "Showing the newest of 3 live runs. See them all with halonic runs --status running --limit 3.",
    );
  });

  it("names what the filters asked for when they match nothing", () => {
    // Line 1 with only --status, then with --workflow support-reply as well.
    const noMatch = (status: StatusFilter) => [
      words(list.noMatch({ status }, "acme")),
      words(list.noMatch({ status, workflow: "support-reply" }, "acme")),
    ];
    expect(words(list.noMatch({ workflow: "support-reply" }, "acme"))).toBe(
      "No runs of support-reply in acme.",
    );
    expect(noMatch("running")).toEqual([
      "No live runs in acme.",
      "No live runs of support-reply in acme.",
    ]);
    expect(noMatch("waiting")).toEqual([
      "No runs waiting for you in acme.",
      "No runs of support-reply waiting for you in acme.",
    ]);
    expect(noMatch("completed")).toEqual([
      "No finished runs in acme.",
      "No finished runs of support-reply in acme.",
    ]);
  });

  it("takes the user's --dir in the commands it suggests", () => {
    expect(words(list.noRunsYet("acme", "./acme"))).toBe(
      "No runs in acme yet. Start one with halonic run --dir ./acme <workflow>.",
    );
    expect(words(list.onlyTestRuns("acme", "./acme"))).toBe(
      "No runs in acme yet, only test runs. Start one with halonic run --dir ./acme <workflow>.",
    );
    expect(words(list.seeEveryRun("./acme"))).toBe("See every run with halonic runs --dir ./acme.");
  });

  it("has the errors of the list's own options", () => {
    expect([
      words(list.action("./downloads")),
      words(list.statusNotOneOf("done")),
      words(list.statusNear("completed")),
      words(list.limitNotWhole("0")),
    ]).toEqual([
      "list the runs in ./downloads",
      '--status takes running, waiting, completed or failed, and you gave "done".',
      "Did you mean completed?",
      '--limit takes a whole number of 1 or more, and you gave "0".',
    ]);
  });

  it("guesses the --status the user meant from Studio's words, then by spelling", () => {
    expect(
      ["done", "needs-you", "needs", "live", "stopped", "Done", "faild", "purple"].map(
        statusYouMeant,
      ),
    ).toEqual([
      "completed",
      "waiting",
      "waiting",
      "running",
      "failed",
      "completed",
      "failed",
      undefined,
    ]);
  });
});
