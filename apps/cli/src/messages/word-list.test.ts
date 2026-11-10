import { describe, expect, it } from "vitest";
import { wordList } from "./word-list.ts";

describe("wordList", () => {
  it.each([
    [[], ""],
    [["approve"], "approve"],
    [["approve", "reject"], "approve or reject"],
    [["go", "wait", "stop"], "go, wait or stop"],
  ])("lists %j as %j", (words, listed) => {
    expect(wordList(words, "or")).toBe(listed);
  });

  it("puts and before the last", () => {
    expect(wordList(["a.md", "b.md", "c.md"], "and")).toBe("a.md, b.md and c.md");
  });
});
