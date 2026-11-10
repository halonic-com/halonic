import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Message } from "./define.ts";
import { dim, plainText } from "./phrase.ts";
import { type NotWaiting, runsMessages, type ShownEnd } from "./runs.ts";

const words = (message: Message) => plainText(message.phrase);

verifies("cli.messages", () => {
  it("has runs send's lines word for word, from cli-output 3.4", () => {
    expect(runsMessages.sent("approve", "01JD8Q", "Support reply").key).toBe("runs.sent");
    expect([
      words(runsMessages.sent("approve", "01JD8Q", "Support reply")),
      words(runsMessages.followIt("01JD8Q")),
      words(runsMessages.sendAction("approve", "01JD8Q")),
      words(runsMessages.notWaiting({ status: "finished", ago: "2 min ago" })),
      words(runsMessages.notWaitingFix("01JD8Q")),
    ]).toEqual([
      "Sent approve to run 01JD8Q. Support reply goes on.",
      "Follow it: halonic runs show 01JD8Q",
      "send approve to run 01JD8Q",
      "it isn't waiting for you. It finished 2 min ago.",
      "See it with halonic runs show 01JD8Q.",
    ]);
  });
});

describe("runs's sentences", () => {
  it("has the summary", () => {
    expect(words(runsMessages.summary())).toBe(
      "List runs, show what one did, or answer one that's waiting for you",
    );
  });

  it("dims the follow-up command, with the user's --dir", () => {
    expect(runsMessages.followIt("01JD8Q", "./acme").phrase).toEqual([
      dim("Follow it: halonic runs show --dir ./acme 01JD8Q"),
    ]);
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
    ]).toEqual([
      "Support reply in acme · run 01JD8Q · started 14:01, finished 14:02",
      "Support reply in acme · run 01JD8Q · started yesterday 16:40, failed yesterday 16:41",
      "Support reply in acme · run 01JD8Q · started 07:12, stopped 07:15",
      "Support reply in acme · run 01JD8Q · started 10:40, waiting for you since 10:41",
      "Support reply in acme · run 01JD8Q · started 10:53, still running",
      "Support reply in acme · test run 01JD8Q · started 14:01, finished 14:02",
    ]);
    expect(words(runsMessages.runningSince("10:53"))).toBe("running since 10:53");
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
    const answered = (event: string) => words(runsMessages.youAnswered(event, "14:02"));
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
    expect(words(runsMessages.waitingSince("14:02"))).toBe("waiting for you since 14:02");
  });

  it("repeats the user's --dir in the fix for a run that isn't waiting", () => {
    expect(words(runsMessages.notWaitingFix("01JD8Q", "./acme"))).toBe(
      "See it with halonic runs show --dir ./acme 01JD8Q.",
    );
  });
});
