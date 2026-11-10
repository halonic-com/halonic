import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { paintFor } from "../output/paint.ts";
import type { Message } from "./define.ts";
import { plainText, renderPhrase } from "./phrase.ts";
import { runMessages } from "./run.ts";

const words = (message: Message) => plainText(message.phrase);
const openaiKey = { name: "openai-key", variable: "HALONIC_SECRET_OPENAI_KEY" };

verifies("cli.messages", () => {
  it("has a failed run's two lines word for word, from cli-output 3.4", () => {
    const reason = runMessages.keyRefused("OpenAI", openaiKey, "smart").phrase;
    const line1 = runMessages.failedInStep("Support reply", "Draft reply", reason);
    expect(line1.key).toBe("run.failedInStep");
    expect(words(line1)).toBe(
      "Support reply failed in the step Draft reply: OpenAI didn't accept the key in the secret openai-key (HALONIC_SECRET_OPENAI_KEY), used by the model alias smart.",
    );
    expect(words(runMessages.replaceKey("OpenAI", "HALONIC_SECRET_OPENAI_KEY"))).toBe(
      "Replace the key in Studio (Settings › Models › OpenAI), or set HALONIC_SECRET_OPENAI_KEY, then run again.",
    );
  });

  it("has the receipt in three lines, from cli-output 3.4", () => {
    const receipt = { changedFiles: 1, sent: ["1 email"], askedYou: 1, estimatedCost: "€0.004" };
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
      "Answer in Studio's Inbox, or here: halonic runs send 01JD8Q approve  (or reject)",
    );
    expect(words(runMessages.answerHere("01JD8Q", ["done"], "./acme"))).toBe(
      "Answer in Studio's Inbox, or here: halonic runs send --dir ./acme 01JD8Q done",
    );
  });

  it("leaves out what doesn't apply in the receipt, but always says what was sent", () => {
    expect(words(runMessages.receipt({ changedFiles: 0, sent: [], askedYou: 1 }))).toBe(
      "Sent nothing · asked you once",
    );
    expect(
      words(
        runMessages.receipt({ changedFiles: 2, sent: [], askedYou: 2, estimatedCost: "€0.03" }),
      ),
    ).toBe("Changed 2 files · sent nothing · asked you twice · estimated cost €0.03");
  });

  it("has the line for an agent that runs without the sandbox", () => {
    expect(words(runMessages.onThisComputer("Writer", "9 Nov"))).toBe(
      "Writer runs on this computer without the sandbox, as chosen on 9 Nov.",
    );
  });

  it("has the missing-key reason", () => {
    const reason = runMessages.noKey(openaiKey, "smart").phrase;
    expect(words(runMessages.failedInStep("Support reply", "Draft reply", reason))).toBe(
      "Support reply failed in the step Draft reply: there's no key in the secret openai-key (HALONIC_SECRET_OPENAI_KEY), used by the model alias smart.",
    );
  });

  it("has line 2 for each approved reason", () => {
    expect([
      words(runMessages.addKey("OpenAI", "HALONIC_SECRET_OPENAI_KEY")),
      words(runMessages.signedOutFix("Gmail")),
      words(runMessages.outOfCreditFix("OpenAI")),
      words(runMessages.tryLaterFix()),
      words(runMessages.startOllamaFix()),
      words(runMessages.checkConnectionFix()),
      words(runMessages.modelMissingFix("llama3.2", "fast")),
      words(runMessages.budgetFix("1 Dec")),
      words(runMessages.turnLimitFix("Sorter", "01JD8Q", "sorter.agent.yaml")),
      words(runMessages.localOnlyFix("Sorter", "smart")),
      words(runMessages.blockedSiteFix("api.example.net", "Reporter")),
    ]).toEqual([
      "Add the key in Studio (Settings › Models › OpenAI), or set HALONIC_SECRET_OPENAI_KEY, then run again.",
      "Sign in again in Studio (Library › Gmail), then run again.",
      "Add credit at OpenAI, then run again. This isn't your Halonic budget.",
      "Run it again in a few minutes.",
      "Start Ollama, then run again.",
      "Check your internet connection, then run again.",
      "Run ollama pull llama3.2, or point the model alias fast at another model in models.yaml.",
      "Raise the budget in models.yaml, or wait until it resets on 1 Dec.",
      "See what Sorter did with halonic runs show 01JD8Q. Raise its turn limit in sorter.agent.yaml if it needs more turns.",
      "Point Sorter's model alias smart at a local model in models.yaml.",
      "Add api.example.net to Reporter's allowed sites, if Reporter should reach it.",
    ]);
  });
});
