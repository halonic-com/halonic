import { describe, expect, it } from "vitest";
import { groupedDigits, listInWords } from "./counts.ts";

describe("listInWords", () => {
  it.each([
    [[], "nothing"],
    [["approve"], "approve"],
    [["approve", "reject"], "approve or reject"],
    [["go", "wait", "stop"], "go, wait or stop"],
  ])("lists %j as %j with or", (names, listed) => {
    expect(listInWords(names, "or")).toBe(listed);
  });

  it("puts and before the last unless told otherwise", () => {
    expect(listInWords(["a.md", "b.md", "c.md"])).toBe("a.md, b.md and c.md");
  });
});

describe("groupedDigits", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [1_000, "1,000"],
    [50_000, "50,000"],
    [1_234_567, "1,234,567"],
  ])("writes %d as %j", (count, written) => {
    expect(groupedDigits(count)).toBe(written);
  });
});
