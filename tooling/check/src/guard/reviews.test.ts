import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { approvers, type Files, fakeGit } from "../test/signing-fixture.ts";
import { type ApprovalVerdict, type PullRequest, signedApprovals } from "./approvals.ts";
import { parseDecisionNote } from "./decision-notes.ts";
import { githubReviews, type Review, type ReviewSource } from "./reviews.ts";
import { approversFile } from "./signatures.ts";

const userId = 4242;
const branch = "julian/HAL-1337-review";
const noteFile = `decisions/${branch}.md`;
const base = "b".repeat(40);
const head = "a".repeat(40);
const older = "c".repeat(40);
const pull: PullRequest = { repo: "halonic-com/halonic", number: 7, head, base };
const note = (kind = "user-visible") => `# Decision: change CI

- Approval: https://paperclip.example/HAL/issues/HAL-1337
- Kind: ${kind}

The build needs a new step.

## Covers

- .github/
`;
const pinned = approvers({ reviewers: [userId] });

const review = (state: string, commitId = head, id = userId): Review => ({
  userId: id,
  state,
  commitId,
});

async function verdictOf(
  reviews: ReviewSource | undefined,
  options: { text?: string; baseFiles?: Files; headFiles?: Files } = {},
): Promise<ApprovalVerdict> {
  const text = options.text ?? note();
  const git = fakeGit({
    [base]: options.baseFiles ?? { [approversFile]: pinned },
    [head]: options.headFiles ?? { [approversFile]: pinned, [noteFile]: text },
  });
  const parsed = parseDecisionNote(noteFile, text);
  if (!parsed.ok) {
    throw new Error("the test note must parse");
  }
  return signedApprovals(pull, git, reviews).check({ note: parsed.note });
}

const listing =
  (...reviews: Review[]): ReviewSource =>
  () =>
    Promise.resolve(reviews);

verifies("check.guard-user-review", () => {
  test("approves a note the pinned account approved on the head commit", async () => {
    expect(await verdictOf(listing(review("APPROVED")))).toEqual({ approved: true });
  });

  test("doesn't count an approval of an older commit", async () => {
    expect(await verdictOf(listing(review("APPROVED", older)))).toEqual({
      approved: false,
      reason: expect.stringContaining("hasn't approved the pull request's latest commit aaaaaaa"),
    });
  });

  test("lets a dismissal or a later request for changes replace an approval, and a comment not", async () => {
    expect((await verdictOf(listing(review("DISMISSED")))).approved).toBe(false);
    expect(
      (await verdictOf(listing(review("APPROVED"), review("CHANGES_REQUESTED")))).approved,
    ).toBe(false);
    expect((await verdictOf(listing(review("APPROVED"), review("COMMENTED")))).approved).toBe(true);
    expect(
      (await verdictOf(listing(review("CHANGES_REQUESTED"), review("APPROVED")))).approved,
    ).toBe(true);
  });

  test("ignores an approval by an account that isn't pinned", async () => {
    expect((await verdictOf(listing(review("APPROVED", head, userId + 1)))).approved).toBe(false);
  });

  test("ignores an account that only the pull request's own approvers.json pins", async () => {
    const own = approvers({ reviewers: [userId + 1] });
    const verdict = await verdictOf(listing(review("APPROVED", head, userId + 1)), {
      headFiles: { [approversFile]: own, [noteFile]: note() },
    });
    expect(verdict.approved).toBe(false);
  });

  test("fails closed with no reviews source, a failing one, or no pinned account", async () => {
    expect((await verdictOf(undefined)).approved).toBe(false);
    const failing: ReviewSource = () => Promise.reject(new Error("GitHub answered 502"));
    expect(await verdictOf(failing)).toEqual({
      approved: false,
      reason: expect.stringContaining("GitHub answered 502"),
    });
    const none = { baseFiles: { [approversFile]: approvers({}) } };
    expect((await verdictOf(listing(review("APPROVED")), none)).approved).toBe(false);
  });

  test("doesn't approve an internal note, or a note the base already has, by a review", async () => {
    expect(
      (await verdictOf(listing(review("APPROVED")), { text: note("internal") })).approved,
    ).toBe(false);
    const inherited = await verdictOf(listing(review("APPROVED")), {
      baseFiles: { [approversFile]: pinned, [noteFile]: note() },
    });
    expect(inherited).toEqual({
      approved: false,
      reason: expect.stringContaining("already on the base branch"),
    });
  });

  test("lists every page of reviews and fails on an error status", async () => {
    const pages = [
      new Response(JSON.stringify([{ user: { id: 1 }, state: "COMMENTED", commit_id: head }]), {
        headers: { link: '<https://api.github.com/next>; rel="next"' },
      }),
      new Response(JSON.stringify([{ user: { id: userId }, state: "APPROVED", commit_id: head }])),
    ];
    const urls: string[] = [];
    const fetchPage = ((url: string) => {
      urls.push(url);
      return Promise.resolve(pages.shift() ?? new Response("", { status: 500 }));
    }) as unknown as typeof fetch;
    expect(await githubReviews("token", fetchPage)("halonic-com/halonic", 7)).toEqual([
      review("COMMENTED", head, 1),
      review("APPROVED"),
    ]);
    expect(urls).toEqual([
      "https://api.github.com/repos/halonic-com/halonic/pulls/7/reviews?per_page=100",
      "https://api.github.com/next",
    ]);
    const broken = (() =>
      Promise.resolve(new Response("", { status: 403 }))) as unknown as typeof fetch;
    await expect(githubReviews("token", broken)("halonic-com/halonic", 7)).rejects.toThrow("403");
  });
});
