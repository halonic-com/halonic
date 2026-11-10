import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { paintFor } from "../output/paint.ts";
import type { Message } from "./define.ts";
import { bold, dim, plainText, renderPhrase } from "./phrase.ts";
import { testMessages, unknownStep } from "./test.ts";

const words = (message: Message) => plainText(message.phrase);

verifies("cli.messages", () => {
  it("has test's lines word for word, from cli-output 3.3", () => {
    expect(words(testMessages.testing("acme"))).toBe(
      "Testing acme with the test model. Nothing is sent anywhere.",
    );
    expect(words(testMessages.name("support-reply", "answers a refund question"))).toBe(
      "support-reply › answers a refund question",
    );
    expect(words(testMessages.endedElsewhere("Closed", "Send reply"))).toBe(
      "Expected the run to end in the step Closed, but it ended in Send reply.",
    );
    expect(words(testMessages.someFailed(2, 1, 0.9))).toBe("2 passed, 1 failed. 3 tests in 0.9 s.");
  });

  it("says which expected file a run didn't save, from cli-output 3.3 revision 23", () => {
    expect(words(testMessages.fileNotSaved("reply.md", ["summary.md"]))).toBe(
      "Expected the run to save reply.md, but it didn't. It saved summary.md.",
    );
  });
});

describe("test's sentences", () => {
  it("has the summary", () => {
    expect(words(testMessages.summary())).toBe(
      "Run a workspace's workflow tests with the test model",
    );
  });

  it("writes a test's name with > where the output isn't UTF-8", () => {
    const oldConsole = paintFor({ colour: false, live: false, unicode: false });
    const name = testMessages.name("support-reply", "answers a refund question");
    expect(renderPhrase(name.phrase, oldConsole)).toBe("support-reply > answers a refund question");
  });

  it("dims the time and the place, to a tenth of a second", () => {
    expect(testMessages.took(0.4).phrase).toEqual([dim("0.4 s")]);
    expect(testMessages.took(2).phrase).toEqual([dim("2.0 s")]);
    expect(testMessages.where("hubs/support/workflows/support-reply.test.yaml", 31).phrase).toEqual(
      [dim("hubs/support/workflows/support-reply.test.yaml:31")],
    );
  });

  it("puts the steps of a failure and the failed count in bold", () => {
    expect(testMessages.endedElsewhere("Closed", "Send reply").phrase).toEqual([
      "Expected the run to end in the step ",
      bold("Closed"),
      ", but it ended in ",
      bold("Send reply"),
      ".",
    ]);
    expect(testMessages.someFailed(2, 1, 0.9).phrase).toContainEqual(bold("1 failed"));
  });

  it("has a sentence for each other expectation, from cli-output 3.3 revision 23", () => {
    expect(
      words(
        testMessages.wentElsewhere(
          ["Read mail", "Classify", "Draft reply", "Closed"],
          ["Read mail", "Classify", "Draft reply", "Send reply"],
        ),
      ),
    ).toBe(
      "Expected the run to go through Read mail, Classify, Draft reply and Closed, but it went through Read mail, Classify, Draft reply and Send reply.",
    );
    expect(
      words(testMessages.endedOtherwise("completed", { status: "failed", step: "Draft reply" })),
    ).toBe("Expected the run to finish, but it failed in the step Draft reply.");
    expect(words(testMessages.otherValue("ticket.status", "closed", "open"))).toBe(
      'Expected ticket.status to be "closed" when the run ended, but it was "open".',
    );
    expect(words(testMessages.valueNotSet("ticket.status", "closed"))).toBe(
      'Expected ticket.status to be "closed" when the run ended, but it wasn\'t set.',
    );
    expect(words(testMessages.fileNotSaved("reply.md", ["summary.md"]))).toBe(
      "Expected the run to save reply.md, but it didn't. It saved summary.md.",
    );
    expect(words(testMessages.fileNotSaved("reply.md", []))).toBe(
      "Expected the run to save reply.md, but it saved no files.",
    );
  });

  it("says every status in its own words", () => {
    expect(words(testMessages.endedOtherwise("waiting", { status: "completed" }))).toBe(
      "Expected the run to wait for an answer, but it finished.",
    );
    expect(
      words(testMessages.endedOtherwise("failed", { status: "waiting", step: "Approve" })),
    ).toBe("Expected the run to fail, but it's waiting for an answer in the step Approve.");
  });

  it("writes context values as compact JSON, cut off nowhere", () => {
    expect(words(testMessages.otherValue("ticket.priority", 2, null))).toBe(
      "Expected ticket.priority to be 2 when the run ended, but it was null.",
    );
    expect(words(testMessages.otherValue("ticket.tags", ["refund", "vip"], { a: true }))).toBe(
      'Expected ticket.tags to be ["refund","vip"] when the run ended, but it was {"a":true}.',
    );
    expect(testMessages.otherValue("ticket.status", "closed", "open").phrase).toContainEqual(
      bold("ticket.status"),
    );
  });

  it("lists every file the run saved, and quotes a step the workflow doesn't have", () => {
    expect(words(testMessages.fileNotSaved("reply.md", ["a.md", "b.md", "c.md"]))).toBe(
      "Expected the run to save reply.md, but it didn't. It saved a.md, b.md and c.md.",
    );
    expect(
      words(testMessages.wentElsewhere(["Read mail", unknownStep("clos")], ["Read mail"])),
    ).toBe('Expected the run to go through Read mail and "clos", but it went through Read mail.');
  });

  it("has the line for a program step without a script", () => {
    expect(words(testMessages.unscriptedProgram("Build report"))).toBe(
      "The step Build report would start a program, and tests never start programs. Script its result in the test file.",
    );
  });

  it("counts the tests when all passed", () => {
    expect(words(testMessages.allPassed(3, 0.9))).toBe("3 tests passed in 0.9 s.");
    expect(words(testMessages.allPassed(1, 0.4))).toBe("1 test passed in 0.4 s.");
  });

  it("has the lines for no tests and a filter that matches none", () => {
    expect(words(testMessages.noTests("acme"))).toBe("acme has no workflow tests yet.");
    expect(words(testMessages.noTestsFix())).toBe(
      "Add one next to a workflow as <workflow>.test.yaml.",
    );
    expect(words(testMessages.noMatch("refnd"))).toBe('No tests match "refnd".');
    expect(words(testMessages.noMatchFix())).toBe("Run halonic test --list to see them all.");
    expect(words(testMessages.noMatchFix("./acme"))).toBe(
      "Run halonic test --dir ./acme --list to see them all.",
    );
  });
});
