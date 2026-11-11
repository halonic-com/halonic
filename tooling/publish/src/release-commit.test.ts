import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { commitsOfPush, findReleaseCommit } from "./release-commit.ts";

const release = "chore(release): Halonic 0.1.0";

function find(
  commits: string[],
  versions: Record<string, string>,
  titles: Record<string, string[]>,
) {
  return findReleaseCommit(
    commits,
    (sha) => versions[sha] ?? "0.1.0",
    (sha) => titles[sha] ?? [],
  );
}

verifies("publish.release-commit", () => {
  describe("findReleaseCommit", () => {
    it("picks the release commit when the merge queue pushed another commit after it", () => {
      const found = find(
        ["699c83b", "11a0e48"],
        {},
        { "699c83b": [release], "11a0e48": ["fix(app): x (HAL-1)"] },
      );
      expect(found).toEqual({ sha: "699c83b", version: "0.1.0" });
    });

    it("accepts a task suffix on the title, as the squash commit carries one", () => {
      expect(find(["a"], {}, { a: [`${release} (HAL-4824)`] })?.sha).toBe("a");
      expect(find(["a"], {}, { a: [`${release}1 (HAL-4824)`, `${release} (x)`] })).toBeUndefined();
    });

    it("finds none when the commits merged only ordinary pull requests", () => {
      expect(find(["a", "b"], {}, { a: ["feat: a"], b: ["fix: b"] })).toBeUndefined();
    });

    it("finds none when the title and the version at that commit disagree", () => {
      expect(find(["a"], { a: "0.1.0" }, { a: ["chore(release): Halonic 0.2.0"] })).toBeUndefined();
    });

    it("finds the release when it is the only commit pushed", () => {
      expect(find(["a"], {}, { a: [release] })?.sha).toBe("a");
    });
  });

  describe("commitsOfPush", () => {
    it("lists the commits of before..sha", () => {
      const ranges: string[] = [];
      const shas = commitsOfPush("b", "s", (range) => {
        ranges.push(range);
        return ["x", "s"];
      });
      expect({ shas, ranges }).toEqual({ shas: ["x", "s"], ranges: ["b..s"] });
    });

    it("falls back to the pushed commit for a new branch, an empty range or a range git cannot list", () => {
      const none = () => [];
      const boom = () => {
        throw new Error("bad range");
      };
      expect([commitsOfPush("0000000", "s", none), commitsOfPush("", "s", none)]).toEqual([
        ["s"],
        ["s"],
      ]);
      expect([commitsOfPush("b", "s", none), commitsOfPush("b", "s", boom)]).toEqual([
        ["s"],
        ["s"],
      ]);
    });

    it("keeps only the newest 50 commits", () => {
      const all = Array.from({ length: 60 }, (_, i) => `c${i}`);
      const shas = commitsOfPush("b", "c59", () => all);
      expect([shas.length, shas[0], shas.at(-1)]).toEqual([50, "c10", "c59"]);
    });
  });
});
