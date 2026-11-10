import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { Message } from "./define.ts";
import { bold, dim, plainText } from "./phrase.ts";
import { validateMessages } from "./validate.ts";

const words = (message: Message) => plainText(message.phrase);

verifies("cli.messages", () => {
  it("has validate's summary line word for word, from cli-output 3.2", () => {
    const message = validateMessages.found({
      errors: 2,
      warnings: 1,
      filesWithProblems: 2,
      checked: 14,
    });
    expect(message.key).toBe("validate.found");
    expect(words(message)).toBe("2 errors and 1 warning in 2 files. Checked 14 files.");
    expect(message.phrase[0]).toEqual(bold("2 errors"));
  });
});

describe("validate's sentences", () => {
  it("has the summary and the action that frames its errors", () => {
    expect(words(validateMessages.summary())).toBe("Check a workspace's files and say what to fix");
    expect(words(validateMessages.action("./downloads"))).toBe("check ./downloads");
  });

  it("passes with no problems, or with warnings alone", () => {
    expect(words(validateMessages.noProblems(14, "acme"))).toBe(
      "Checked 14 files in acme. No problems.",
    );
    expect(words(validateMessages.onlyWarnings(14, "acme", 1))).toBe(
      "Checked 14 files in acme. 1 warning.",
    );
    expect(words(validateMessages.onlyWarnings(1, "acme", 3))).toBe(
      "Checked 1 file in acme. 3 warnings.",
    );
  });

  it("counts errors and warnings, leaving out a kind that has none", () => {
    const counts = { errors: 41, warnings: 6, filesWithProblems: 9, checked: 14 };
    expect(words(validateMessages.found(counts))).toBe(
      "41 errors and 6 warnings in 9 files. Checked 14 files.",
    );
    expect(
      words(validateMessages.found({ ...counts, errors: 1, warnings: 0, filesWithProblems: 1 })),
    ).toBe("1 error in 1 file. Checked 14 files.");
    expect(words(validateMessages.found({ ...counts, errors: 0, warnings: 2 }))).toBe(
      "2 warnings in 9 files. Checked 14 files.",
    );
  });

  it("says how many problems are hidden, with the user's own --dir in the command", () => {
    expect(words(validateMessages.hidden(20, 47))).toBe(
      "Showing the first 20 of 47 problems. Run halonic validate --all to see them all.",
    );
    expect(words(validateMessages.hidden(20, 47, "./acme"))).toBe(
      "Showing the first 20 of 47 problems. Run halonic validate --dir ./acme --all to see them all.",
    );
  });

  it("dims a problem's place and code", () => {
    expect(validateMessages.where(12, 10).phrase).toEqual([dim("12:10")]);
    expect(validateMessages.code("unknown-alias").phrase).toEqual([dim("(unknown-alias)")]);
  });
});
