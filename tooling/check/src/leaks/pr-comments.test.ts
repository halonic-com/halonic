import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import {
  findHits,
  hitsIssueBody,
  type PullRequestText,
  parseLogins,
  scanSince,
} from "./pr-comments.ts";
import { TermMatcher } from "./terms.ts";

const matcher = new TermMatcher(["Zorblat Quenn"]);

function text(
  pullRequest: number,
  body: string,
  extra: Partial<PullRequestText> = {},
): PullRequestText {
  return {
    pullRequest,
    kind: "comment",
    url: `https://github.com/o/r/pull/${pullRequest}#issuecomment-${body.length}`,
    author: "someone",
    text: body,
    ...extra,
  };
}

verifies("check.leak-pr-comments", () => {
  describe("finding personal terms in pull request texts", () => {
    test("lists each pull request with a term once, with a link to each text", () => {
      const hits = findHits(
        [
          text(7, "thanks zorblat quenn"),
          text(3, "Zorblat Quenn said", {
            kind: "review",
            url: "https://github.com/o/r/pull/3#pullrequestreview-1",
          }),
          text(7, "fine"),
          text(7, "and ZORBLAT-QUENN again", {
            kind: "review comment",
            url: "https://github.com/o/r/pull/7#discussion_r2",
          }),
        ],
        matcher,
        [],
      );
      expect(hits).toEqual([
        {
          pullRequest: 3,
          links: [{ kind: "review", url: "https://github.com/o/r/pull/3#pullrequestreview-1" }],
        },
        {
          pullRequest: 7,
          links: [
            { kind: "comment", url: "https://github.com/o/r/pull/7#issuecomment-20" },
            { kind: "review comment", url: "https://github.com/o/r/pull/7#discussion_r2" },
          ],
        },
      ]);
    });

    test("skips texts written by a skipped login, in any case", () => {
      const hits = findHits(
        [text(5, "Zorblat Quenn here", { author: "Board-Login" }), text(6, "nothing")],
        matcher,
        parseLogins("other, board-login\n"),
      );
      expect(hits).toEqual([]);
    });

    test("the issue body names numbers and links, never the matched text", () => {
      const body = hitsIssueBody(
        findHits([text(9, "hi Zorblat Quenn")], matcher, []),
        "https://run",
      );
      expect(body).toContain("#9: [comment](https://github.com/o/r/pull/9#issuecomment-16)");
      expect(body).toContain("https://run");
      expect(body.toLowerCase()).not.toContain("zorblat");
    });
  });

  describe("where an incremental scan starts", () => {
    test("from the newest run whose scan succeeded", () => {
      expect(
        scanSince([
          { startedAt: "2026-11-26T04:17:00Z", scanSucceeded: false },
          { startedAt: "2026-11-24T04:17:00Z", scanSucceeded: true },
          { startedAt: "2026-11-25T04:17:00Z", scanSucceeded: true },
        ]),
      ).toBe("2026-11-25T04:17:00Z");
    });

    test("a full scan when no run succeeded", () => {
      expect(
        scanSince([{ startedAt: "2026-11-26T04:17:00Z", scanSucceeded: false }]),
      ).toBeUndefined();
    });
  });
});
