import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { type AuthorFacts, authorOf, namesPull } from "./author.ts";

const agents = [
  { id: "agent-elena", urlKey: "elena" },
  { id: "agent-liam", urlKey: "liam" },
];

/** An `elena/…` pull request #6385 opened as the team account, with Elena's hand-over comment. */
const facts: AuthorFacts = {
  repo: "halonic-com/halonic",
  pr: 6385,
  branch: "elena/HAL-1-name",
  ownBranch: true,
  openedBy: "halonic-dev",
  teamLogin: "halonic-dev",
  agents,
  comments: [
    {
      authorAgentId: "agent-elena",
      origin: "comment",
      body: "Ready: halonic#6385, head `abc1234`.",
    },
  ],
};

verifies("paperclip.review-verdict", () => {
  describe("authorOf", () => {
    test("the branch's agent is the author once they named the pull request themselves", () => {
      expect(authorOf(facts)).toEqual({ author: "elena" });
    });

    test("the prefix alone never decides: someone else's comment, or a receipt, doesn't count", () => {
      const byLiam = {
        ...facts,
        comments: [{ authorAgentId: "agent-liam", origin: "comment", body: "halonic#6385" }],
      };
      expect(authorOf(byLiam)).toEqual({
        refusal:
          "elena, whom the branch names, hasn't named halonic#6385 on the task in a comment of their own",
      });
      const receipt = {
        ...facts,
        comments: [{ authorAgentId: "agent-elena", origin: "fast_response", body: "halonic#6385" }],
      };
      expect("refusal" in authorOf(receipt)).toBe(true);
      const unknownOrigin = {
        ...facts,
        comments: [{ authorAgentId: "agent-elena", origin: "system_note", body: "halonic#6385" }],
      };
      expect("refusal" in authorOf(unknownOrigin)).toBe(true);
      const otherPull = {
        ...facts,
        comments: [{ authorAgentId: "agent-elena", origin: "comment", body: "halonic#63850" }],
      };
      expect("refusal" in authorOf(otherPull)).toBe(true);
    });

    test("a branch whose prefix isn't an agent, or a fork's branch, is refused", () => {
      expect(authorOf({ ...facts, branch: "nobody/HAL-1-x" })).toEqual({
        refusal: "its branch names nobody, who isn't one of the company's agents",
      });
      expect("refusal" in authorOf({ ...facts, ownBranch: false })).toBe(true);
      expect("refusal" in authorOf({ ...facts, openedBy: "" })).toBe(true);
    });

    test("a pull request another account opened has that account as its author", () => {
      expect(authorOf({ ...facts, openedBy: "dependabot[bot]", comments: [] })).toEqual({
        author: "dependabot[bot]",
      });
    });
  });

  test("namesPull reads the URL and the short forms, not a longer number", () => {
    const repo = "halonic-com/halonic";
    expect(namesPull("https://github.com/halonic-com/halonic/pull/6385", repo, 6385)).toBe(true);
    expect(namesPull("see halonic-com/halonic#6385.", repo, 6385)).toBe(true);
    expect(namesPull("PR #6385 is ready", repo, 6385)).toBe(true);
    expect(namesPull("cloud#6385", repo, 6385)).toBe(false);
    expect(namesPull("halonic#63851", repo, 6385)).toBe(false);
    expect(namesPull("https://github.com/halonic-com/cloud/pull/6385", repo, 6385)).toBe(false);
  });
});
