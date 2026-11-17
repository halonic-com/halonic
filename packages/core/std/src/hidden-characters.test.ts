import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { escapeHidden, isHiddenCharacter, markHiddenName } from "./hidden-characters.ts";

verifies("std.hidden-characters", () => {
  it("finds direction overrides, zero-width and control characters", () => {
    for (const point of [0x202e, 0x2066, 0x200b, 0xfeff, 0x00ad, 0x0000, 0x007f, 0xe0041]) {
      expect(isHiddenCharacter(point)).toBe(true);
    }
  });

  it("leaves letters, tab and newline alone", () => {
    for (const character of ["a", "é", "€", "\t", "\n", "公"]) {
      expect(isHiddenCharacter(character.codePointAt(0) ?? 0)).toBe(false);
    }
  });

  it("writes a hidden character in JSON as its escape, which is the same JSON", () => {
    const value = `Refund${String.fromCodePoint(0x202e)}for Sam`;
    const escaped = escapeHidden(JSON.stringify(value));
    expect(escaped).toBe('"Refund\\u202efor Sam"');
    expect(JSON.parse(escaped)).toBe(value);
  });

  it("writes a tag character as its two UTF-16 escapes", () => {
    const value = `a${String.fromCodePoint(0xe0041)}`;
    const escaped = escapeHidden(JSON.stringify(value));
    expect(escaped).toBe('"a\\udb40\\udc41"');
    expect(JSON.parse(escaped)).toBe(value);
  });

  it("writes a name's hidden characters out as markers", () => {
    expect(markHiddenName(`create${String.fromCodePoint(0x200b)}note`)).toBe("create⟦U+200B⟧note");
    expect(markHiddenName(`backend/x${String.fromCodePoint(0x202e)}sj.exe`)).toBe(
      "backend/x⟦U+202E⟧sj.exe",
    );
    expect(markHiddenName("a\u001b[31mb")).toBe("a⟦U+001B⟧[31mb");
  });

  it("leaves a name without hidden characters as it is, and a Windows line end as a newline", () => {
    expect(markHiddenName("create_note")).toBe("create_note");
    expect(markHiddenName("one\r\ntwo")).toBe("one\ntwo");
    expect(markHiddenName("one\rtwo")).toBe("one⟦U+000D⟧two");
  });
});
