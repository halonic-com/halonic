import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { type CallContext, repoName, statusCall } from "./match.ts";

/** A folder cloned from `origin`, with no `GH_REPO`. */
function inClone(origin = "https://github.com/halonic-com/halonic.git"): CallContext {
  return { ghRepo: undefined, remotes: () => new Map([["origin", origin]]) };
}

const halonic = inClone();
const call = (line: string, context = halonic) => statusCall(line.split(" "), context);

verifies("paperclip.gh-guard", () => {
  describe("which gh calls the guard answers", () => {
    test.each([
      ["pr checks 5208", "pr checks", 5208, "pr_status"],
      ["pr checks 5208 --watch --fail-fast", "pr checks", 5208, "pr_status"],
      ["pr view 5208", "pr view", 5208, "pr_status"],
      ["pr view #5208 --json state,statusCheckRollup,mergeable", "pr view", 5208, "pr_status"],
      ["pr view https://github.com/halonic-com/halonic/pull/77", "pr view", 77, "pr_status"],
      ["pr checks", "pr checks", undefined, "pr_status"],
      ["pr list", "pr list", undefined, "my_prs"],
      [
        "pr list --state open --author @me --json number,headRefName",
        "pr list",
        undefined,
        "my_prs",
      ],
      ["pr status", "pr status", undefined, "my_prs"],
      ["run list -b priya/HAL-1-x -L 3", "run list", undefined, "pr_status"],
      ["run view 99 --exit-status", "run view", undefined, "pr_status"],
    ])("gh %s → %s", (line, command, pr, tool) => {
      expect(call(line)).toEqual({ command, repo: "halonic-com/halonic", pr, tool });
    });

    test.each([
      ["pr view 5208 --comments"],
      ["pr view 5208 -c"],
      ["pr view 5208 --json body"],
      ["pr view 5208 --json=files,state"],
      ["pr view 5208 --web"],
      ["pr checks 5208 -w"],
      ["pr list --state merged"],
      ["pr list -s all"],
      ["pr list --search HAL-16401"],
      ["pr list -H priya/HAL-16401-gh-guard"],
      ["pr list --label fast-track"],
      ["run view 99 --log-failed"],
      ["run view 99 --log"],
      ["run view 99 --json jobs"],
      ["run view 99 --json=status,conclusion"],
      ["run view 99 --job 137351327876"],
      ["run view -j 137351327876 --json steps"],
      ["run view 99 -v"],
      ["run list -w mutation.yml"],
      ["run list --workflow=ci.yml -b main"],
      ["pr checks --help"],
      ["pr diff 5208"],
      ["pr checkout 5208"],
      ["pr create --draft"],
      ["pr merge 5208 --squash"],
      ["run rerun 99 --failed"],
      ["api repos/halonic-com/halonic/pulls/5208"],
      ["--version"],
      [""],
    ])("gh %s runs as it is", (line) => {
      expect(call(line)).toBeUndefined();
    });
  });

  describe("which repository the call reads", () => {
    test("another repository by flag, URL, GH_REPO or remote runs as it is", () => {
      expect(call("pr checks 12 -R cli/cli")).toBeUndefined();
      expect(call("pr checks 12 --repo=cli/cli")).toBeUndefined();
      expect(call("pr checks 12 -Rcli/cli")).toBeUndefined();
      expect(call("pr view https://github.com/halonic-com/website/pull/3")).toBeUndefined();
      expect(
        call("pr checks 12", { ghRepo: "halonic-com/website", remotes: halonic.remotes }),
      ).toBe(undefined);
      expect(call("pr checks 12", inClone("git@github.com:halonic-com/website.git"))).toBe(
        undefined,
      );
    });

    test("halonic named by flag, host form or GH_REPO counts from any folder", () => {
      const elsewhere: CallContext = { ghRepo: undefined, remotes: () => new Map() };
      expect(call("pr checks 12 -R halonic-com/halonic", elsewhere)?.pr).toBe(12);
      expect(call("pr checks 12 -R github.com/Halonic-com/Halonic", elsewhere)?.pr).toBe(12);
      expect(
        call("pr status", { ghRepo: "halonic-com/halonic", remotes: () => new Map() }),
      ).toEqual(expect.objectContaining({ tool: "my_prs" }));
      expect(call("pr status", elsewhere)).toBeUndefined();
    });

    test("the remote gh picks: upstream before origin", () => {
      const fork: CallContext = {
        ghRepo: undefined,
        remotes: () =>
          new Map([
            ["origin", "https://github.com/someone/halonic.git"],
            ["upstream", "https://github.com/halonic-com/halonic.git"],
          ]),
      };
      expect(call("pr checks 5", fork)?.repo).toBe("halonic-com/halonic");
    });

    test("the remotes are read only when nothing else names the repository", () => {
      let reads = 0;
      const counting: CallContext = {
        ghRepo: undefined,
        remotes: () => {
          reads += 1;
          return new Map();
        },
      };
      call("pr checks 1 -R halonic-com/halonic", counting);
      call("pr merge 1", counting);
      expect(reads).toBe(0);
    });

    test.each([
      ["halonic-com/halonic", "halonic-com/halonic"],
      ["https://github.com/halonic-com/halonic", "halonic-com/halonic"],
      ["https://x-access-token:abc@github.com/halonic-com/halonic.git", "halonic-com/halonic"],
      ["git@github.com:halonic-com/halonic.git", "halonic-com/halonic"],
      ["ssh://git@github.com/halonic-com/halonic.git", "halonic-com/halonic"],
      ["halonic", undefined],
    ])("repoName(%s) is %s", (text, expected) => {
      expect(repoName(text)).toBe(expected);
    });
  });
});
