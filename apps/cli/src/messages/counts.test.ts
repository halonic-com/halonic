import { describe, expect, it } from "vitest";
import { listInWords } from "./counts.ts";

describe("listInWords", () => {
  it.each([
    [[], ""],
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
