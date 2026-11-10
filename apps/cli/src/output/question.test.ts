import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { defineMessages, type Message } from "../messages/define.ts";
import { bold, phrase, plainText } from "../messages/phrase.ts";
import { type AskInputs, askYesNo, canAsk, type QuestionTerminal } from "./question.ts";

const trust = defineMessages("test", {
  question: () => phrase`Trust ${bold("Acme")} on this computer?`,
});

/** A terminal where the user types `answers`, one line each, then stdin ends. */
function typing(...answers: string[]): QuestionTerminal & { readonly written: string[] } {
  const written: string[] = [];
  return {
    written,
    write: (text) => written.push(text),
    readLine: async () => answers.shift(),
  };
}

const noTerminal = () =>
  new KindedError(
    "denied",
    "Acme isn't trusted on this computer yet, and there's no terminal to ask you.",
  );

function ask(terminal: QuestionTerminal, allowed = true): Promise<boolean> {
  return askYesNo(trust.question(), {
    canAsk: allowed,
    terminal,
    render: (message: Message) => plainText(message.phrase),
    refusal: noTerminal,
  });
}

/** A terminal on stdin, outside CI, without `--json`, changed by `overrides`. */
function inputs(overrides: Partial<AskInputs> = {}): AskInputs {
  return { env: {}, stdinIsTerminal: true, json: false, ...overrides };
}

verifies("cli.questions", () => {
  describe("canAsk", () => {
    it("asks only when stdin is a terminal", () => {
      expect(canAsk(inputs())).toBe(true);
      expect(canAsk(inputs({ stdinIsTerminal: false }))).toBe(false);
    });

    it("never asks with CI set, unless it's 0 or false", () => {
      expect(canAsk(inputs({ env: { CI: "true" } }))).toBe(false);
      expect(canAsk(inputs({ env: { CI: "1" } }))).toBe(false);
      expect(canAsk(inputs({ env: { CI: "false" } }))).toBe(true);
      expect(canAsk(inputs({ env: { CI: "0" } }))).toBe(true);
    });

    it("never asks with --json", () => {
      expect(canAsk(inputs({ json: true }))).toBe(false);
    });
  });

  it("asks with [y/N] after the question, on the same line", async () => {
    const terminal = typing("y");
    expect(await ask(terminal)).toBe(true);
    expect(terminal.written).toEqual(["Trust Acme on this computer? [y/N] "]);
  });

  it("takes y and yes in any case as yes", async () => {
    for (const answer of ["y", "Y", "yes", " YES "]) {
      expect(await ask(typing(answer))).toBe(true);
    }
  });

  it("takes anything else as no, the careful default", async () => {
    for (const answer of ["", "n", "no", "yep", "ja"]) {
      expect(await ask(typing(answer))).toBe(false);
    }
    expect(await ask(typing())).toBe(false);
  });

  it("refuses without asking when no question may be asked", async () => {
    const terminal = typing("y");
    await expect(ask(terminal, false)).rejects.toThrow("there's no terminal to ask you");
    expect(terminal.written).toEqual([]);
  });
});
