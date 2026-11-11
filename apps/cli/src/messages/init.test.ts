import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { paintFor } from "../output/paint.ts";
import type { Message } from "./define.ts";
import { fileMessages } from "./files.ts";
import { initMessages } from "./init.ts";
import { bold, dim, plainText, renderPhrase } from "./phrase.ts";

const words = (message: Message) => plainText(message.phrase);
const acme = { hubs: 2, agents: 3, workflows: 2, routines: 1 };

verifies("cli.messages", () => {
  it("has init's lines for the Acme example word for word, from cli-output 3.1", () => {
    expect(words(initMessages.createdExample("./acme"))).toBe(
      "Created a copy of the Acme example in ./acme.",
    );
    expect(words(initMessages.exampleContents(acme))).toBe(
      "2 hubs · 3 agents · 2 workflows · 1 routine · runs on the test model, no key needed",
    );
    expect(words(initMessages.nextRun("support-reply", "examples/refund-question.json"))).toBe(
      "halonic run support-reply --input examples/refund-question.json",
    );
  });

  it("keys init's sentences under init", () => {
    expect(initMessages.notEmpty().key).toBe("init.notEmpty");
    expect(fileMessages.diskFull().key).toBe("files.diskFull");
  });
});

describe("init's sentences", () => {
  it("has the success lines, with the folder in bold", () => {
    expect(words(initMessages.created("acme", "./acme"))).toBe(
      "Created the workspace acme in ./acme.",
    );
    expect(initMessages.createdExample("./acme").phrase).toContainEqual(bold("./acme"));
    expect(words(initMessages.createdExampleBeside("./acme-2", "./acme"))).toBe(
      "Created a copy of the Acme example in ./acme-2. ./acme was already there.",
    );
  });

  it("dims the example's contents and falls back to - for its separators without UTF-8", () => {
    const contents = initMessages.exampleContents({
      hubs: 1,
      agents: 1,
      workflows: 1,
      routines: 2,
    });
    const oldConsole = paintFor({ colour: false, live: false, unicode: false });
    expect(renderPhrase(contents.phrase, oldConsole)).toBe(
      "1 hub - 1 agent - 1 workflow - 2 routines - runs on the test model, no key needed",
    );
    expect(contents.phrase[0]).toEqual(dim("1 hub"));
  });

  it("has the Next: block's commands and their dimmed why-words", () => {
    expect([
      words(initMessages.nextHeading()),
      words(initMessages.nextChangeFolder("acme")),
      words(initMessages.nextValidate()),
      words(initMessages.nextValidateWhy()),
      words(initMessages.nextTest()),
      words(initMessages.nextTestWhy()),
      words(initMessages.nextFirstAgent()),
    ]).toEqual([
      "Next:",
      "cd acme",
      "halonic validate",
      "check the files as you edit them",
      "halonic test",
      "run its workflow tests (no key, nothing sent)",
      "Add your first agent: https://docs.halonic.com/examples/agent-with-a-tool",
    ]);
    expect(initMessages.nextTestWhy().phrase).toEqual([
      dim("run its workflow tests (no key, nothing sent)"),
    ]);
  });

  it("has the summary and the action that frames its errors", () => {
    expect(words(initMessages.summary())).toBe("Create a workspace, or a copy of the Acme example");
    expect(words(initMessages.action("./acme"))).toBe("create the workspace in ./acme");
  });

  it("has the errors' reasons and fixes", () => {
    expect(words(initMessages.notEmpty())).toBe("the folder isn't empty.");
    expect(words(initMessages.notEmptyFix())).toBe(
      "Pick a new folder name, or run it in an empty folder.",
    );
    expect(words(initMessages.unknownExample("demo"))).toBe('There\'s no example called "demo".');
    expect(words(initMessages.unknownExampleNear("acem", "acme"))).toBe(
      'There\'s no example called "acem". Did you mean acme?',
    );
    expect(words(initMessages.examples(["acme"]))).toBe("Examples: acme");
    expect(words(initMessages.tooManyFolders(["acme", "demo"]))).toBe(
      "halonic init takes one folder name, and you gave two: acme, demo.",
    );
  });

  it("has the reasons a file couldn't be written, as Studio's save errors", () => {
    expect([
      words(fileMessages.diskFull()),
      words(fileMessages.diskFullFix()),
      words(fileMessages.notWritable()),
      words(fileMessages.inUse()),
    ]).toEqual([
      "the disk is full.",
      "Free some space, then run it again.",
      "Halonic can't write to this folder.",
      "another app is using the file.",
    ]);
  });
});
