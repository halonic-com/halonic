import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { amsterdamTime } from "./amsterdam-time.ts";
import { type PullRequestStatus, pullRequestText } from "./pulls/pull-request.ts";

verifies("runtime.amsterdam-time", () => {
  describe("amsterdamTime", () => {
    test("a winter time is CET, an hour ahead of UTC", () => {
      expect(amsterdamTime("2026-11-26T15:05:00.000Z")).toBe("26 Nov 16:05 CET");
    });

    test("a summer time is CEST, two hours ahead of UTC", () => {
      expect(amsterdamTime(new Date("2026-07-01T15:40:00Z"))).toBe("1 Jul 17:40 CEST");
    });

    test("the zone follows the daylight saving switch, not a fixed offset", () => {
      // Clocks go back at 01:00 UTC on 25 Oct 2026.
      expect(amsterdamTime("2026-10-25T00:30:00Z")).toBe("25 Oct 02:30 CEST");
      expect(amsterdamTime("2026-10-25T01:30:00Z")).toBe("25 Oct 02:30 CET");
    });

    test("the day is Amsterdam's, not UTC's", () => {
      expect(amsterdamTime(Date.parse("2026-11-25T23:30:00Z"))).toBe("26 Nov 00:30 CET");
    });

    test("text that isn't a time comes back as it is", () => {
      expect(amsterdamTime("")).toBe("");
      expect(amsterdamTime("unknown")).toBe("unknown");
    });
  });

  test("pr_status writes the review finding's time in Amsterdam time and keeps UTC in its data", () => {
    const status: PullRequestStatus = {
      repo: "acme/website",
      number: 12,
      url: "https://github.com/acme/website/pull/12",
      title: "feat: checkout",
      state: "open",
      draft: false,
      branch: "priya/ACME-7-checkout",
      author: "priya",
      task: "ACME-7",
      head: "7651f8c1e4af38752f56d353156c5dd19ff54984",
      ciOk: "success",
      mergeable: "yes",
      behindBase: 0,
      inQueue: false,
      approvals: [],
      approvedOnHead: false,
      changedLines: 10,
      latestReviewFinding: "c42 at 2026-11-26T15:05:00Z",
      reviewer: undefined,
    };
    expect(pullRequestText(status)).toContain(
      "newest review finding on this head: c42 at 26 Nov 16:05 CET",
    );
    expect(status.latestReviewFinding).toBe("c42 at 2026-11-26T15:05:00Z");
  });
});
