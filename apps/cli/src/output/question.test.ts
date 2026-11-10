import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { defineMessages } from "../messages/define.ts";
import { bold, markPart, phrase, plainText } from "../messages/phrase.ts";
import { trustMessages } from "../messages/trust.ts";
import { NotTrustedError } from "../not-trusted.ts";
import {
  type AskInputs,
  askYesNo,
  canAsk,
  type Question,
  type QuestionTerminal,
} from "./question.ts";

const trust = defineMessages("test", {
  question: () => phrase`Trust ${bold("Acme")} on this computer?`,
  heading: () => phrase`Trust check for ${bold("Acme")} (./acme)`,
  unpinned: () => phrase`${markPart("needsYou")} mail-mcp isn't pinned to a version.`,
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

/** `trust`'s refusal without a terminal: `not_trusted`, never `denied`, which is for a real no (F6). */
const noTerminal = () =>
  new NotTrustedError({
    problem: trustMessages.noTerminal("Acme"),
    fix: trustMessages.noTerminalFix("./acme"),
    fingerprint: `hfp1:${"0".repeat(64)}`,
    check: [],
  });

function ask(
  terminal: QuestionTerminal,
  allowed = true,
  yes = false,
  extra: Partial<Question> = {},
): Promise<boolean> {
  return askYesNo(
    { question: trust.question(), yes, refusal: noTerminal, ...extra },
    { canAsk: allowed, terminal, render: plainText },
  );
}

/** The trust check's lines, as a command shows them before its question. */
const check = [trust.heading().phrase, trust.unpinned().phrase];

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

  describe("with lines shown first", () => {
    it("writes them, a line each, right before the question", async () => {
      const terminal = typing("y");
      expect(await ask(terminal, true, false, { shownFirst: check })).toBe(true);
      expect(terminal.written).toEqual([
        "Trust check for Acme (./acme)\n",
        "! mail-mcp isn't pinned to a version.\n",
        "Trust Acme on this computer? [y/N] ",
      ]);
    });

    it("writes none of them when it refuses or --yes answers", async () => {
      const terminal = typing("y");
      await expect(ask(terminal, false, false, { shownFirst: check })).rejects.toThrow(
        "there's no terminal to ask you",
      );
      expect(await ask(terminal, true, true, { shownFirst: check })).toBe(true);
      expect(terminal.written).toEqual([]);
    });
  });

  describe("with --yes", () => {
    /** A terminal that fails the test if anything is asked or read. */
    const untouched: QuestionTerminal = {
      write: (text) => expect.unreachable(`wrote ${JSON.stringify(text)}`),
      readLine: () => expect.unreachable("read stdin"),
    };

    it("takes yes without asking, even in a terminal", async () => {
      expect(await ask(untouched, canAsk(inputs()), true)).toBe(true);
    });

    it("prints no question text with --json", async () => {
      expect(await ask(untouched, canAsk(inputs({ json: true })), true)).toBe(true);
    });

    it("still refuses without a terminal when --yes isn't given", async () => {
      const allowed = canAsk(inputs({ stdinIsTerminal: false }));
      await expect(ask(untouched, allowed, false)).rejects.toThrow(
        "there's no terminal to ask you",
      );
    });
  });
});
