import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { paintFor } from "../output/paint.ts";
import type { Message } from "./define.ts";
import { plainText, renderPhrase } from "./phrase.ts";
import { runMessages } from "./run.ts";
import { stopMessages } from "./stop.ts";

const words = (message: Message) => plainText(message.phrase);

verifies("cli.messages", () => {
  it("has the receipt in three lines, from cli-output 3.4", () => {
    const receipt = {
      changedFiles: 1,
      sent: [{ count: 1, one: "email", many: "emails" }],
      askedYou: 1,
      estimatedCost: 0.004,
    };
    expect([
      words(runMessages.finished("Support reply", "18 s")),
      words(runMessages.receipt(receipt)),
      words(runMessages.runLog("01JD8Q")),
    ]).toEqual([
      "Support reply finished in 18 s.",
      "Changed 1 file · sent 1 email · asked you once · estimated cost €0.004",
      "Run log: halonic runs show 01JD8Q",
    ]);
  });
});

describe("run's sentences", () => {
  it("has the summary, the action and the end of a refused run's line 1", () => {
    expect(words(runMessages.summary())).toBe("Run a workflow and follow it step by step");
    expect(words(runMessages.action("support-reply"))).toBe("run support-reply");
    expect(words(runMessages.nothingRan())).toBe("Nothing ran.");
  });

  it("says what Ctrl C stopped, after Stopped. (cli-output 1.5)", () => {
    const meaning = runMessages.cancelledAfter("01JD8Q", "Classify").phrase;
    expect(words(stopMessages.stopped(meaning))).toBe(
      "Stopped. The run 01JD8Q was cancelled after the step Classify. Nothing after it ran.",
    );
    const notCancelled = runMessages.notCancelled("01JD8Q").phrase;
    expect(words(stopMessages.stopped(notCancelled))).toBe(
      "Stopped. The run 01JD8Q wasn't cancelled, only no longer followed, so it may go on. See where it is: halonic runs show 01JD8Q",
    );
  });

  it("has the live heading and a step's facts, with - for · without UTF-8", () => {
    expect(words(runMessages.heading("Support reply", "acme", "01JD8Q"))).toBe(
      "Running Support reply in acme · run 01JD8Q",
    );
    const oldConsole = paintFor({ colour: false, live: false, unicode: false });
    expect(renderPhrase(runMessages.stepFacts(["Sorter", "fast"]).phrase, oldConsole)).toBe(
      "Sorter - fast",
    );
  });

  it("has the waiting lines", () => {
    expect(words(runMessages.waitingForYou("Approve this reply?"))).toBe(
      "Waiting for you: Approve this reply?",
    );
    expect(words(runMessages.waitingInStep("review"))).toBe("Waiting for you in the step review.");
    expect(words(runMessages.answerHere())).toBe("Answer in Studio's Inbox.");
  });

  it("leaves out what doesn't apply in the receipt, and says sent nothing only without a tool call", () => {
    expect(words(runMessages.receipt({ changedFiles: 0, sent: [], askedYou: 1 }))).toBe(
      "Sent nothing · asked you once",
    );
    expect(
      words(runMessages.receipt({ changedFiles: 2, sent: [], askedYou: 2, estimatedCost: 0.03 })),
    ).toBe("Changed 2 files · sent nothing · asked you twice · estimated cost €0.03");
    // Tool calls whose log doesn't say what they sent: no sent part, never a guess.
    expect(words(runMessages.receipt({ changedFiles: 1, askedYou: 0, estimatedCost: 0.004 }))).toBe(
      "Changed 1 file · estimated cost €0.004",
    );
    expect(words(runMessages.receipt({ changedFiles: 0, askedYou: 0 }))).toBe("");
  });

  it("has the line for an agent that runs without the sandbox", () => {
    expect(words(runMessages.onThisComputer("Writer", "9 Nov"))).toBe(
      "Writer runs on this computer without the sandbox, as chosen on 9 Nov.",
    );
  });

  it("says a run that only sent nothing, and counts and joins what it sent", () => {
    expect(words(runMessages.receipt({ changedFiles: 0, sent: [], askedYou: 0 }))).toBe(
      "Sent nothing",
    );
    const sent = [
      { count: 1, one: "email", many: "emails" },
      { count: 2, one: "message", many: "messages" },
      { count: 3, one: "file", many: "files" },
    ];
    expect(words(runMessages.receipt({ changedFiles: 0, sent, askedYou: 0 }))).toBe(
      "Sent 1 email, 2 messages and 3 files",
    );
  });

  it("repeats the user's --dir in the run log line", () => {
    expect(words(runMessages.runLog("01JD8Q", "./acme"))).toBe(
      "Run log: halonic runs show --dir ./acme 01JD8Q",
    );
  });
});
