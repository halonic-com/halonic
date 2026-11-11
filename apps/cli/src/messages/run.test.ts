import type { RunSends } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { paintFor } from "../output/paint.ts";
import type { Message } from "./define.ts";
import { plainText, renderPhrase } from "./phrase.ts";
import { runMessages } from "./run.ts";
import { stopMessages } from "./stop.ts";

const words = (message: Message) => plainText(message.phrase);

/** A run without a tool call, which "sent nothing". */
const noToolCalls: RunSends = { sent: [], maySend: [], madeToolCalls: false };

/** A run whose tool calls sent nothing, so its receipt has no sent part. */
const toolCallsOnly: RunSends = { sent: [], maySend: [], madeToolCalls: true };

const driveFile = { one: "Drive file", many: "Drive files" };

verifies("cli.messages", () => {
  it("has the receipt in three lines, from cli-output 3.4", () => {
    const receipt = {
      changedFiles: 1,
      sends: {
        sent: [{ verb: "sent", counts: [{ noun: { one: "email", many: "emails" }, calls: 1 }] }],
        maySend: [],
        madeToolCalls: true,
      } satisfies RunSends,
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

  it("has the waiting lines, with the first event written out and the user's --dir", () => {
    expect(words(runMessages.waitingForYou("Approve this reply?"))).toBe(
      "Waiting for you: Approve this reply?",
    );
    expect(words(runMessages.waitingInStep("review"))).toBe("Waiting for you in the step review.");
    expect(words(runMessages.answerHere("01JD8Q", ["approve", "reject"]))).toBe(
      "Answer with: halonic runs send 01JD8Q approve (or reject)",
    );
    expect(words(runMessages.answerHere("01jd8q", ["approve", "reject", "hold", "skip"]))).toBe(
      "Answer with: halonic runs send 01jd8q approve (or reject, hold or skip)",
    );
    expect(words(runMessages.answerHere("01JD8Q", ["done"], "./acme"))).toBe(
      "Answer with: halonic runs send --dir ./acme 01JD8Q done",
    );
  });

  it("writes the author's label after an event that has one, and keeps the event to type", () => {
    const labels = { approve: "Send reply", hold: "Ask me later" };
    expect(words(runMessages.answerHere("01jd8q", ["approve", "reject"], undefined, labels))).toBe(
      "Answer with: halonic runs send 01jd8q approve (Send reply) (or reject)",
    );
    expect(
      words(runMessages.answerHere("01jd8q", ["reject", "approve", "hold"], "./acme", labels)),
    ).toBe(
      "Answer with: halonic runs send --dir ./acme 01jd8q reject (or approve (Send reply) or hold (Ask me later))",
    );
  });

  it("leaves out a label that only repeats its event, apart from case, spaces, dashes and underscores", () => {
    const repeats = { approve: "Approve", reject: "REJECT", needs_changes: "Needs changes" };
    expect(
      words(
        runMessages.answerHere(
          "01jd8q",
          ["approve", "reject", "needs_changes"],
          undefined,
          repeats,
        ),
      ),
    ).toBe("Answer with: halonic runs send 01jd8q approve (or reject or needs_changes)");
    const differs = { approve: "Send it", "needs-changes": "Needs change" };
    expect(
      words(runMessages.answerHere("01jd8q", ["approve", "needs-changes"], undefined, differs)),
    ).toBe(
      "Answer with: halonic runs send 01jd8q approve (Send it) (or needs-changes (Needs change))",
    );
  });

  it("reads only the workflow's own labels, so an event named toString or constructor has none", () => {
    expect(
      words(runMessages.answerHere("01jd8q", ["toString", "constructor"], undefined, {})),
    ).toBe("Answer with: halonic runs send 01jd8q toString (or constructor)");
  });

  it("escapes a label's control characters, since the label comes from the workflow file", () => {
    const labels = { approve: "\u001b[31mSend\u202e", reject: "Drop\nit" };
    expect(words(runMessages.answerHere("01jd8q", ["approve", "reject"], undefined, labels))).toBe(
      "Answer with: halonic runs send 01jd8q approve (\\u001b[31mSend\\u202e) (or reject (Drop\\u000ait))",
    );
  });

  it("leaves out what doesn't apply in the receipt, and says sent nothing only without a tool call", () => {
    const sends = noToolCalls;
    expect(words(runMessages.receipt({ changedFiles: 0, sends, askedYou: 1 }))).toBe(
      "Sent nothing · asked you once",
    );
    expect(
      words(runMessages.receipt({ changedFiles: 2, sends, askedYou: 2, estimatedCost: 0.03 })),
    ).toBe("Changed 2 files · sent nothing · asked you twice · estimated cost €0.03");
    // Tool calls that sent nothing: no sent part.
    expect(
      words(
        runMessages.receipt({
          changedFiles: 1,
          sends: toolCallsOnly,
          askedYou: 0,
          estimatedCost: 0.004,
        }),
      ),
    ).toBe("Changed 1 file · estimated cost €0.004");
    expect(words(runMessages.receipt({ changedFiles: 0, sends: toolCallsOnly, askedYou: 0 }))).toBe(
      "",
    );
  });

  it("has the line for an agent that runs without the sandbox", () => {
    expect(words(runMessages.onThisComputer("Writer", "9 Nov"))).toBe(
      "Writer runs on this computer without the sandbox, as chosen on 9 Nov.",
    );
  });

  it("says a run that only sent nothing, and says what it sent, one phrase per verb in call order", () => {
    expect(words(runMessages.receipt({ changedFiles: 0, sends: noToolCalls, askedYou: 0 }))).toBe(
      "Sent nothing",
    );
    const sends: RunSends = {
      sent: [
        {
          verb: "sent",
          counts: [
            { noun: { one: "email", many: "emails" }, calls: 1 },
            { noun: { one: "invite", many: "invites" }, calls: 2 },
            { noun: { one: "cancellation", many: "cancellations" }, calls: 1 },
          ],
        },
        { verb: "saved", counts: [{ noun: driveFile, calls: 1 }] },
      ],
      maySend: [{ verb: "moved", counts: [{ noun: driveFile, calls: 1 }] }],
      madeToolCalls: true,
    };
    expect(
      words(runMessages.receipt({ changedFiles: 1, sends, askedYou: 1, estimatedCost: 0.004 })),
    ).toBe(
      "Changed 1 file · sent 1 email, 2 invites and 1 cancellation · saved 1 Drive file · may have moved 1 Drive file · asked you once · estimated cost €0.004",
    );
  });

  it("starts with what a run saved when it only saved, with the capital on it", () => {
    const sends: RunSends = {
      sent: [{ verb: "saved", counts: [{ noun: driveFile, calls: 1 }] }],
      maySend: [],
      madeToolCalls: true,
    };
    expect(
      words(runMessages.receipt({ changedFiles: 0, sends, askedYou: 0, estimatedCost: 0.004 })),
    ).toBe("Saved 1 Drive file · estimated cost €0.004");
  });

  it("repeats the user's --dir in the run log line", () => {
    expect(words(runMessages.runLog("01JD8Q", "./acme"))).toBe(
      "Run log: halonic runs show --dir ./acme 01JD8Q",
    );
  });
});
