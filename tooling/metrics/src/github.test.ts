import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { findingsTable, noFindings } from "./findings.ts";
import { createReader, type Fetch, nextLink, reviewFindings } from "./github.ts";

const repo = "acme/tools";
const window = { since: "2026-11-01", until: "2026-11-08" };

interface Call {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
}

/** A fake GitHub: answers each path from `routes`, with an optional next link. */
function fakeGitHub(routes: Record<string, { body: unknown; next?: string }>) {
  const calls: Call[] = [];
  const fetch: Fetch = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers });
    const { pathname, search } = new URL(url);
    const route = routes[pathname + search];
    const link = route?.next === undefined ? null : `<${route.next}>; rel="next"`;
    return {
      ok: route !== undefined,
      status: route === undefined ? 404 : 200,
      headers: new Headers(link === null ? {} : { link }),
      json: async () => route?.body,
    };
  };
  return { fetch, calls };
}

function pull(number: number, mergedAt: string | null, updatedAt = mergedAt ?? "2026-11-05") {
  return { number, title: `Change ${number}`, merged_at: mergedAt, updated_at: updatedAt };
}

const list = "/repos/acme/tools/pulls?state=closed&sort=updated&direction=desc&per_page=100";

function noComments(number: number) {
  return {
    [`/repos/acme/tools/pulls/${number}/reviews?per_page=100`]: { body: [] },
    [`/repos/acme/tools/pulls/${number}/comments?per_page=100`]: { body: [] },
    [`/repos/acme/tools/issues/${number}/comments?per_page=100`]: { body: [] },
  };
}

verifies("metrics.findings-per-pull-request", () => {
  test("counts the findings of reviews, inline comments and conversation comments", async () => {
    const github = fakeGitHub({
      [list]: { body: [pull(12, "2026-11-03T10:00:00Z")] },
      "/repos/acme/tools/pulls/12/reviews?per_page=100": {
        body: [{ body: "- [major] No test" }, { body: null }],
      },
      "/repos/acme/tools/pulls/12/comments?per_page=100": { body: [{ body: "[minor] Name" }] },
      "/repos/acme/tools/issues/12/comments?per_page=100": { body: [{ body: "[nit] Typo" }] },
    });
    const rows = await reviewFindings(createReader({ fetch: github.fetch }), repo, window);
    expect(rows).toEqual([
      {
        number: 12,
        title: "Change 12",
        mergedAt: "2026-11-03T10:00:00Z",
        findings: { blocker: 0, major: 1, minor: 1, nit: 1 },
      },
    ]);
    expect(findingsTable(rows)).toContain("| **1 PRs** | | 0 | 1 | 1 | 1 | 3 |");
    expect(github.calls.every((call) => call.method === "GET")).toBe(true);
  });

  test("leaves out pull requests merged outside the window or not merged", async () => {
    const github = fakeGitHub({
      [list]: {
        body: [
          pull(20, "2026-11-08T00:00:00Z"),
          pull(19, null, "2026-11-06T00:00:00Z"),
          pull(18, "2026-11-02T00:00:00Z"),
          pull(17, "2026-10-30T00:00:00Z", "2026-11-04T00:00:00Z"),
          pull(16, "2026-11-01T00:00:00Z"),
        ],
      },
      ...noComments(18),
      ...noComments(16),
    });
    const rows = await reviewFindings(createReader({ fetch: github.fetch }), repo, window);
    expect(rows.map((row) => row.number)).toEqual([16, 18]);
    expect(rows[0]?.findings).toEqual(noFindings);
  });

  test("follows next pages, and stops once a page ends before the window", async () => {
    const page2 = `${list}&page=2`;
    const github = fakeGitHub({
      [list]: { body: [pull(31, "2026-11-04T00:00:00Z")], next: `https://api.github.com${page2}` },
      [page2]: { body: [pull(30, "2026-10-01T00:00:00Z")], next: "https://api.github.com/never" },
      ...noComments(31),
    });
    const rows = await reviewFindings(createReader({ fetch: github.fetch }), repo, window);
    expect(rows.map((row) => row.number)).toEqual([31]);
    expect(github.calls.some((call) => call.url.endsWith("/never"))).toBe(false);
  });

  test("refuses a next link to another host, before sending anything there", async () => {
    const github = fakeGitHub({
      [list]: { body: [pull(40, "2026-11-04T00:00:00Z")], next: "https://example.com/steal" },
    });
    const reader = createReader({ fetch: github.fetch, token: "test-token" });
    await expect(reviewFindings(reader, repo, window)).rejects.toThrow(
      "refusing to follow a link to https://example.com",
    );
    expect(github.calls.map((call) => new URL(call.url).host)).toEqual(["api.github.com"]);
  });

  test("sends the token only as a header, and none when it is empty", async () => {
    const withToken = fakeGitHub({ [list]: { body: [] } });
    await reviewFindings(
      createReader({ fetch: withToken.fetch, token: "test-token" }),
      repo,
      window,
    );
    expect(withToken.calls[0]?.headers["authorization"]).toBe("Bearer test-token");
    expect(withToken.calls[0]?.url).not.toContain("test-token");
    const without = fakeGitHub({ [list]: { body: [] } });
    await reviewFindings(createReader({ fetch: without.fetch, token: "" }), repo, window);
    expect(without.calls[0]?.headers["authorization"]).toBeUndefined();
  });

  test("stops with the status when GitHub answers with an error or no list", async () => {
    const missing = fakeGitHub({});
    await expect(
      reviewFindings(createReader({ fetch: missing.fetch }), repo, window),
    ).rejects.toThrow("answered 404");
    const notAList = fakeGitHub({ [list]: { body: { message: "Bad credentials" } } });
    await expect(
      reviewFindings(createReader({ fetch: notAList.fetch }), repo, window),
    ).rejects.toThrow("did not return a list");
  });

  test("reads the next link out of a Link header", () => {
    const header =
      '<https://api.github.com/x?page=1>; rel="prev", <https://api.github.com/x?page=3>; rel="next"';
    expect(nextLink(header)).toBe("https://api.github.com/x?page=3");
    expect(nextLink('<https://api.github.com/x?page=1>; rel="last"')).toBeUndefined();
    expect(nextLink(null)).toBeUndefined();
  });
});
