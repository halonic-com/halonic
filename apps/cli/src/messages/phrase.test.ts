import { describe, expect, it } from "vitest";
import { paintFor } from "../output/paint.ts";
import { bold, dim, fitPhrase, markPart, phrase, plainText, renderPhrase } from "./phrase.ts";

describe("fitPhrase", () => {
  const line = phrase`${markPart("working")} Draft ${bold("reply")} ${dim("(12 s)")}`;

  it("leaves a phrase that fits unchanged", () => {
    expect(fitPhrase(line, 20, true)).toBe(line);
    expect(fitPhrase(line, 20, true)).toEqual(line);
  });

  it("cuts inside a part and keeps the part's emphasis", () => {
    expect(fitPhrase(line, 10, true)).toEqual([markPart("working"), " Draft ", bold("r"), "…"]);
  });

  it("counts a mark as the stream shows it", () => {
    // ".." is two characters where "◌" is one, and "..." three where "…" is one.
    expect(plainText(fitPhrase(line, 8, true))).toBe("◌ Draft…");
    expect(plainText(fitPhrase(line, 8, false))).toBe("◌ Dr...");
  });

  it("never cuts a mark in half", () => {
    expect(fitPhrase(line, 4, false)).toEqual(["..."]);
  });
});

describe("renderPhrase", () => {
  it("draws the separator as - in a stream that isn't UTF-8", () => {
    const oldConsole = paintFor({ colour: false, live: false, unicode: false });
    const line = phrase`not trusted yet ${markPart("separator")} halonic trust`;
    expect(renderPhrase(line, oldConsole)).toBe("not trusted yet - halonic trust");
  });
});
