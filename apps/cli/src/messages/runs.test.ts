import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Message } from "./define.ts";
import { dim, plainText } from "./phrase.ts";
import { runsMessages } from "./runs.ts";

const words = (message: Message) => plainText(message.phrase);

verifies("cli.messages", () => {
  it("has runs send's lines word for word, from cli-output 3.4", () => {
    expect(runsMessages.sent("approve", "01JD8Q", "Support reply").key).toBe("runs.sent");
    expect([
      words(runsMessages.sent("approve", "01JD8Q", "Support reply")),
      words(runsMessages.followIt("01JD8Q")),
      words(runsMessages.sendAction("approve", "01JD8Q")),
      words(runsMessages.notWaiting("2 min ago")),
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
      "Show what a run did, or answer a run that's waiting for you",
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
      'Check the run id: it\'s in the line that said "Waiting for you".',
    );
    expect(words(runsMessages.showNoRun("01JD8X", "acme"))).toBe("There's no run 01JD8X in acme.");
    expect(words(runsMessages.showNoRunFix())).toBe("See recent runs with halonic runs.");
    expect(words(runsMessages.showNoRunFix("./acme"))).toBe(
      "See recent runs with halonic runs --dir ./acme.",
    );
  });

  it("has runs show's heading", () => {
    expect(
      words(runsMessages.showHeading("Support reply", "acme", "01JD8Q", "14:01", "14:02")),
    ).toBe("Support reply in acme · run 01JD8Q · started 14:01, finished 14:02");
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
});
