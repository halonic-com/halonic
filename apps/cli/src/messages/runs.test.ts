import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Message } from "./define.ts";
import { plainText } from "./phrase.ts";
import { type CancelledAt, type NotWaiting, runsMessages, type ShownEnd } from "./runs.ts";
import type { StartedAt } from "./runs-list.ts";

const words = (message: Message) => plainText(message.phrase);

verifies("cli.messages", () => {
  it("has runs send's lines word for word, from cli-output 3.4", () => {
    expect(runsMessages.sent("approve", "01JD8Q", "Support reply").key).toBe("runs.sent");
    expect([
      words(runsMessages.sent("approve", "01JD8Q", "Support reply")),
      words(runsMessages.sendAction("approve", "01JD8Q")),
      words(runsMessages.notWaiting({ status: "finished", ago: "2 min ago" })),
      words(runsMessages.notWaitingFix("01JD8Q")),
    ]).toEqual([
      "Sent approve to run 01JD8Q. Support reply goes on.",
      "send approve to run 01JD8Q",
      "it isn't waiting for you. It finished 2 min ago.",
      "See it with halonic runs show 01JD8Q.",
    ]);
  });
});

describe("runs's sentences", () => {
  it("has the summary", () => {
    expect(words(runsMessages.summary())).toBe("List runs or show what one did");
  });

  it("has the lines for a run that isn't there", () => {
    expect(words(runsMessages.sendActionNoRun("approve"))).toBe("send approve");
    expect(words(runsMessages.noRun("01JD8X", "acme"))).toBe("there's no run 01JD8X in acme.");
    expect(words(runsMessages.noRunFix())).toBe(
      "See the runs waiting for you with halonic runs --status waiting.",
    );
    expect(words(runsMessages.noRunFix("./acme"))).toBe(
      "See the runs waiting for you with halonic runs --dir ./acme --status waiting.",
    );
    expect(words(runsMessages.showNoRun("01JD8X", "acme"))).toBe("There's no run 01JD8X in acme.");
    expect(words(runsMessages.showNoRunFix())).toBe("See recent runs with halonic runs.");
    expect(words(runsMessages.showNoRunFix("./acme"))).toBe(
      "See recent runs with halonic runs --dir ./acme.",
    );
  });

  it("says where a run cancelled somewhere else stopped, with no line 2 (HAL-2745)", () => {
    const cancelled = (at: CancelledAt) => words(runsMessages.showCancelled("Support reply", at));
    expect([
      cancelled({ kind: "in-step", step: "Classify" }),
      cancelled({ kind: "before-step", step: "Classify" }),
      cancelled({ kind: "before-start" }),
    ]).toEqual([
      "Support reply was cancelled in the step Classify. Nothing after it ran.",
      "Support reply was cancelled before the step Classify. Nothing after it ran.",
      "Support reply was cancelled before it started.",
    ]);
  });

  it("has runs show's help line and its action", () => {
    expect(words(runsMessages.showSummary())).toBe("Show what one run did");
    expect(words(runsMessages.showAction("01jd8q"))).toBe("show run 01jd8q");
  });

  it("says runs show takes one run id, with none or with several", () => {
    expect(words(runsMessages.showTakesOneRunId([]))).toBe("halonic runs show needs a run id.");
    expect(words(runsMessages.showTakesOneRunId(["01jd8q", "01jd6m"]))).toBe(
      "halonic runs show takes one run id, and you gave two: 01jd8q, 01jd6m.",
    );
  });

  it("has runs show's heading for every way a run can be", () => {
    const heading = (started: string, end: ShownEnd, test = false) =>
      words(
        runsMessages.showHeading("Support reply", "acme", { id: "01JD8Q", test }, started, end),
      );
    expect([
      heading("14:01", { status: "finished", at: "14:02" }),
      heading("yesterday 16:40", { status: "failed", at: "yesterday 16:41" }),
      heading("07:12", { status: "stopped", at: "07:15" }),
      heading("10:40", { status: "waiting", since: "10:41" }),
      heading("10:53", { status: "running" }),
      heading("14:01", { status: "finished", at: "14:02" }, true),
      heading("14:01", { status: "couldntTry", at: "14:02" }, true),
    ]).toEqual([
      "Support reply in acme · run 01JD8Q · started 14:01, finished 14:02",
      "Support reply in acme · run 01JD8Q · started yesterday 16:40, failed yesterday 16:41",
      "Support reply in acme · run 01JD8Q · started 07:12, stopped 07:15",
      "Support reply in acme · run 01JD8Q · started 10:40, waiting for you since 10:41",
      "Support reply in acme · run 01JD8Q · started 10:53, still running",
      "Support reply in acme · test run 01JD8Q · started 14:01, finished 14:02",
      "Support reply in acme · test run 01JD8Q · started 14:01, ended 14:02, couldn't try everything",
    ]);
    expect(words(runsMessages.runningSince(["Writer", "smart"], "10:53"))).toBe(
      "Writer · smart · running since 10:53",
    );
    expect(words(runsMessages.runningSince([], "10:53"))).toBe("running since 10:53");
  });

  it("says a run couldn't try everything, and which steps it didn't run (HAL-4285)", () => {
    expect(words(runsMessages.showCantTry("Support reply"))).toBe(
      "Support reply couldn't try everything.",
    );
    expect(words(runsMessages.cantTrySteps(["Draft a reply", "Send it"]))).toBe(
      "It didn't run Draft a reply and Send it: they need changes you haven't accepted yet.",
    );
    expect(words(runsMessages.cantTrySteps([]))).toBe("It needs changes you haven't accepted yet.");
  });

  it("says why a run that isn't waiting can't take the event, by its status", () => {
    expect(
      [
        { status: "finished", ago: "2 min ago" },
        { status: "failed", ago: "2 min ago" },
        { status: "stopped", ago: "2 min ago" },
        { status: "running", step: "Draft a reply" },
      ].map((why) => words(runsMessages.notWaiting(why as NotWaiting))),
    ).toEqual([
      "it isn't waiting for you. It finished 2 min ago.",
      "it isn't waiting for you. It failed 2 min ago.",
      "it isn't waiting for you. It stopped 2 min ago.",
      "it isn't waiting for you. It's running, in the step Draft a reply.",
    ]);
  });

  it("has the lines for an event the step doesn't take", () => {
    expect(words(runsMessages.sendAction("aprove", "01JD8Q"))).toBe("send aprove to run 01JD8Q");
    expect(words(runsMessages.eventNotTaken("Approve this reply?", ["approve", "reject"]))).toBe(
      "the step Approve this reply? takes approve or reject.",
    );
    expect(words(runsMessages.eventNotTaken("Hold", ["go", "wait", "stop"]))).toBe(
      "the step Hold takes go, wait or stop.",
    );
    expect(words(runsMessages.eventNear("approve"))).toBe("Did you mean approve?");
    expect(words(runsMessages.seeTheStep("01JD8Q"))).toBe(
      "Run halonic runs show 01JD8Q to see the step.",
    );
  });

  it("has the lines for a short id that two runs end in", () => {
    expect(words(runsMessages.showSeveralRuns("01JD8Q", "acme"))).toBe(
      "Two runs in acme end in 01JD8Q.",
    );
    expect(words(runsMessages.severalRuns("01JD8Q", "acme"))).toBe(
      "two runs in acme end in 01JD8Q.",
    );
    expect(words(runsMessages.severalRunsFix())).toBe(
      "Use the full id, as halonic runs --json shows it.",
    );
  });

  it("says what the user answered at the wait step, guessing no verb", () => {
    const answered = (event: string) =>
      words(runsMessages.youAnswered(event, { day: "today", time: "14:02" }));
    expect([
      answered("approve"),
      answered("reject"),
      answered("hold"),
      answered("Approve"),
    ]).toEqual([
      "you approved at 14:02",
      "you rejected at 14:02",
      "you answered hold at 14:02",
      "you answered Approve at 14:02",
    ]);
    const approvedOn = (at: StartedAt) => words(runsMessages.youAnswered("approve", at));
    expect([
      approvedOn({ day: "yesterday", time: "16:40" }),
      approvedOn({ day: "thisYear", date: { day: 3, month: 11 }, time: "09:12" }),
      approvedOn({ day: "earlier", date: { day: 3, month: 3 }, year: 2025 }),
    ]).toEqual([
      "you approved yesterday at 16:40",
      "you approved on 3 Nov at 09:12",
      "you approved on 3 Mar 2025",
    ]);
    expect(words(runsMessages.waitingSince("14:02"))).toBe("waiting for you since 14:02");
  });

  it("repeats the user's --dir in the fix for a run that isn't waiting", () => {
    expect(words(runsMessages.notWaitingFix("01JD8Q", "./acme"))).toBe(
      "See it with halonic runs show --dir ./acme 01JD8Q.",
    );
  });
});
