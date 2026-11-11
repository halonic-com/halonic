import { describe, expect, it } from "vitest";
import { badSubjects, isConventionalTitle } from "./pr-title.ts";

describe("isConventionalTitle", () => {
  it.each([
    "feat: add the layer check",
    "fix(check): read nested lockfile fields",
    "ci!: require ci-ok",
  ])("accepts %s", (title) => {
    expect(isConventionalTitle(title)).toBe(true);
  });

  it.each(["Add stuff", "feature: x", "fix:missing space", `feat: ${"x".repeat(120)}`])(
    "rejects %s",
    (title) => {
      expect(isConventionalTitle(title)).toBe(false);
    },
  );
});

describe("badSubjects", () => {
  const fine = "feat(check): fine subject (HAL-1)";
  const long = `feat(check): ${"x".repeat(120)}`;

  it("rejects one commit with a long subject, even when the title is fine", () => {
    expect(badSubjects(fine, [long])).toEqual([long]);
  });

  it("accepts one commit with a fine subject", () => {
    expect(badSubjects(fine, [fine])).toEqual([]);
  });

  it("rejects a long title when the one commit's subject is fine", () => {
    expect(badSubjects(long, [fine])).toEqual([long]);
  });

  it("checks the title only when there are several commits", () => {
    expect(badSubjects(fine, [long, "wip"])).toEqual([]);
    expect(badSubjects(long, [fine, fine])).toEqual([long]);
  });

  it("reports nothing for an unknown title with several commits", () => {
    expect(badSubjects(undefined, [long, "wip"])).toEqual([]);
  });

  it("reports the one commit's subject for an unknown title", () => {
    expect(badSubjects(undefined, [long])).toEqual([long]);
  });
});
