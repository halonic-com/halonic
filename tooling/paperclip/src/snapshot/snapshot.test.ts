import { readFileSync } from "node:fs";
import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { type GitHubQuery, gitHubGraphql, gitHubQueryReader, isReadOnly } from "./graphql.ts";
import { closedPullsQuery } from "./queries.ts";
import { type CheckFallback, checksOf, mergeCommitChecks, takeSnapshot, titleCap } from "./read.ts";
import { snapshotVersion } from "./shape.ts";

/** Trimmed real answers from 22 Nov: comment text cut to the line that matters, checks to `ci-ok`. */
interface Recording {
  readonly open: { readonly data: unknown };
  readonly closed: { readonly data: unknown };
  readonly commitChecks: {
    readonly shas: readonly string[];
    readonly body: { readonly data: unknown };
  };
}

function recording(): Recording {
  const file = new URL("./recordings/halonic-22-nov.json", import.meta.url);
  return JSON.parse(readFileSync(file, "utf8")) as Recording;
}

const emptyPage = {
  repository: { pullRequests: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } },
};

/** A GitHub that answers each operation from the recording and remembers every call. */
function fakeQuery(answers: Recording = recording()) {
  const calls: { operation: string; variables: Readonly<Record<string, unknown>> }[] = [];
  const query: GitHubQuery = async (document, variables) => {
    const operation = /query (\w+)/.exec(document)?.[1] ?? "";
    calls.push({ operation, variables });
    if (operation === "OpenPulls") {
      return answers.open.data;
    }
    if (operation === "ClosedPulls") {
      return variables["after"] === null ? answers.closed.data : emptyPage;
    }
    return answers.commitChecks.body.data;
  };
  return { query, calls };
}

const noFallback: CheckFallback = async () => {
  throw new Error("no fallback expected");
};

const repos = ["halonic-com/halonic"];

verifies("paperclip.github-snapshot", () => {
  test("refuses a mutation and sends nothing", async () => {
    const sent: string[] = [];
    const query = gitHubQueryReader({
      token: "test-token",
      fetch: async (url) => {
        sent.push(url);
        return new Response("{}", { status: 200 });
      },
    });
    const mutation =
      'mutation { addComment(input: { subjectId: "x", body: "y" }) { clientMutationId } }';
    await expect(query(mutation, {})).rejects.toThrow("isn't a query");
    await expect(query(`query A { viewer { login } }\n${mutation}`, {})).rejects.toThrow();
    expect(sent).toEqual([]);
    expect(isReadOnly(closedPullsQuery)).toBe(true);
    expect(isReadOnly("# query\nsubscription { x }")).toBe(false);
  });

  test("posts a query only to the GraphQL endpoint, with the token, and names GitHub's error", async () => {
    const sent: { url: string; init: { method: string; headers: Record<string, string> } }[] = [];
    const answer = { data: null, errors: [{ message: "Something went wrong" }] };
    const query = gitHubQueryReader({
      token: "test-token",
      fetch: async (url, init) => {
        sent.push({ url, init });
        return new Response(JSON.stringify(answer), { status: 200 });
      },
    });
    await expect(query("query { viewer { login } }", {})).rejects.toThrow(
      "GitHub: the GraphQL query answered 200: Something went wrong.",
    );
    expect(sent.map(({ url, init }) => [url, init.method, init.headers["authorization"]])).toEqual([
      [gitHubGraphql, "POST", "Bearer test-token"],
    ]);
    expect(gitHubGraphql).toBe("https://api.github.com/graphql");
  });

  test("keeps checks, finding, approvals, labels and the queue, and no comment text", async () => {
    const { query } = fakeQuery();
    const snapshot = await takeSnapshot({
      token: "shared",
      query,
      repos,
      now: new Date("2026-11-22T14:10:00Z"),
      fallback: noFallback,
    });
    expect(snapshot.version).toBe(snapshotVersion);
    const [repo] = snapshot.repos;
    expect(repo?.defaultBranch).toBe("main");
    expect(repo?.queue.map((entry) => [entry.number, entry.position])).toEqual([
      [4794, 1],
      [4825, 2],
      [5028, 3],
      [5111, 4],
    ]);
    expect(repo?.queue[0]?.enqueuedBy).toBe("board-member");
    const pull = repo?.pulls.find((each) => each.number === 4965);
    expect(pull?.state).toBe("open");
    expect(pull?.open?.ciOk).toBe("success");
    expect(pull?.open?.draftCiOk).toBe("missing");
    // Julian's "changes requested" names an older head, but a conversation comment has no commit.
    // It names the reviewer who asked, so the task can go back to them (HAL-18460).
    expect(pull?.open?.finding).toEqual({
      id: "i7077736706",
      at: "2026-11-22T10:21:12Z",
      by: "Julian",
    });
    expect(pull?.open?.approvals).toEqual([
      { by: "Liam", head: "2fb148897" },
      { by: "Liam", head: "8e574ea05" },
      { by: "Liam", head: "40156c667" },
      { by: "Julian", head: "40156c667" },
    ]);
    expect(pull?.open?.labels).toEqual([
      { name: "built-on:paperclip", addedBy: "halonic-dev", addedAt: "2026-11-22T07:29:38Z" },
    ]);
    const conflicting = repo?.pulls.find((each) => each.number === 4952);
    expect(conflicting?.open?.mergeable).toBe("no");
    expect(repo?.pulls.find((each) => each.number === 5116)?.open?.draft).toBe(true);
    expect(JSON.stringify(snapshot)).not.toMatch(
      /approved on head|changes requested|recorded comment/,
    );
  });

  test("names the failing and the still running checks on a head, by their newest run", () => {
    const run = (name: string, status: string, conclusion: string | null, startedAt: string) => ({
      name,
      status,
      conclusion,
      startedAt,
    });
    const rollup = {
      contexts: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          run("Lint", "COMPLETED", "FAILURE", "2026-11-22T10:00:00Z"),
          run("Lint", "COMPLETED", "SUCCESS", "2026-11-22T11:00:00Z"),
          run("Test", "COMPLETED", "FAILURE", "2026-11-22T11:00:00Z"),
          run("ci-ok", "COMPLETED", "FAILURE", "2026-11-22T11:00:00Z"),
          run("Build", "IN_PROGRESS", null, "2026-11-22T11:00:00Z"),
        ],
      },
    };
    expect(checksOf(rollup)).toEqual({
      failingChecks: ["Test", "ci-ok"],
      pendingChecks: ["Build"],
    });
    expect(checksOf(null)).toEqual({ failingChecks: [], pendingChecks: [] });
  });

  test("counts a skipped or neutral check as neither failing nor running, a cancelled one as running", () => {
    const run = (name: string, conclusion: string, startedAt: string | null) => ({
      name,
      status: "COMPLETED",
      conclusion,
      startedAt,
    });
    const rollup = {
      contexts: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [
          run("Windows build", "SKIPPED", null),
          run("Docs site", "SKIPPED", null),
          run("Advisory", "NEUTRAL", "2026-11-22T11:00:00Z"),
          run("Retried", "SKIPPED", "2026-11-22T10:00:00Z"),
          run("Retried", "FAILURE", "2026-11-22T11:00:00Z"),
          run("Cancelled", "CANCELLED", "2026-11-22T11:00:00Z"),
          run("ci-ok", "SUCCESS", "2026-11-22T11:00:00Z"),
        ],
      },
    };
    expect(checksOf(rollup)).toEqual({
      failingChecks: ["Retried"],
      pendingChecks: ["Cancelled"],
    });
  });

  test("reads closed pull requests until one is older than the window", async () => {
    const recent = fakeQuery();
    const all = await takeSnapshot({
      token: "shared",
      query: recent.query,
      repos,
      now: new Date("2026-11-22T14:10:00Z"),
      fallback: noFallback,
    });
    const closed = all.repos[0]?.pulls.filter((pull) => pull.open === null) ?? [];
    expect(closed.map((pull) => pull.number)).toEqual([4794, 5096, 5106, 5105, 5103, 5098]);
    expect(closed[0]).toMatchObject({ state: "merged", headRepo: "halonic-com/halonic" });
    expect(recent.calls.filter((call) => call.operation === "ClosedPulls")).toHaveLength(2);

    // Three days later only the four updated after 13:50 on 22 Nov are left, and page 2 isn't read.
    const later = fakeQuery();
    const window = await takeSnapshot({
      token: "shared",
      query: later.query,
      repos,
      now: new Date("2026-11-25T13:50:00Z"),
      fallback: noFallback,
    });
    const kept = window.repos[0]?.pulls.filter((pull) => pull.open === null) ?? [];
    expect(kept.map((pull) => pull.number)).toEqual([4794, 5096, 5106, 5105]);
    expect(later.calls.filter((call) => call.operation === "ClosedPulls")).toHaveLength(1);
  });

  test("reads ci-ok another way when a head has more than 100 checks without it", async () => {
    const answers = recording();
    const page = answers.open.data as {
      repository: {
        pullRequests: {
          nodes: {
            number: number;
            commits: { nodes: { commit: { statusCheckRollup: { contexts: unknown } } }[] };
          }[];
        };
      };
    };
    for (const node of page.repository.pullRequests.nodes) {
      const rollup = node.commits.nodes[0]?.commit.statusCheckRollup;
      if (rollup !== undefined && node.number === 5114) {
        rollup.contexts = { pageInfo: { hasNextPage: true }, nodes: [{ name: "lint" }] };
      }
    }
    const asked: string[] = [];
    const fake = fakeQuery(answers);
    const snapshot = await takeSnapshot({
      token: "shared",
      query: fake.query,
      repos,
      now: new Date("2026-11-22T14:10:00Z"),
      fallback: async (_repo, sha, name) => {
        asked.push(`${sha.slice(0, 7)} ${name}`);
        return "pending";
      },
    });
    expect(asked).toEqual(["0d237fd ci-ok", "0d237fd ci-ok (draft, light run)"]);
    // The fallbacks count as calls too (HAL-17933).
    expect(snapshot.githubCalls).toBe(fake.calls.length + asked.length);
    expect(snapshot.repos[0]?.pulls.find((pull) => pull.number === 5114)?.open?.ciOk).toBe(
      "pending",
    );
  });

  test("reads ci-ok on merge commits in one query, each commit as a variable", async () => {
    const answers = recording();
    const { query, calls } = fakeQuery(answers);
    const [first = "", second = ""] = answers.commitChecks.shas;
    const documents: string[] = [];
    const checks = await mergeCommitChecks(
      async (document, variables) => {
        documents.push(document);
        return query(document, variables);
      },
      "halonic-com/halonic",
      [first, second, first],
      noFallback,
    );
    expect(calls).toEqual([
      {
        operation: "CommitChecks",
        variables: { owner: "halonic-com", name: "halonic", c0: first, c1: second },
      },
    ]);
    expect(documents[0]).not.toContain(first);
    expect([...checks]).toEqual([
      [first, "success"],
      [second, "success"],
    ]);
  });
});

verifies("paperclip.queue-state", () => {
  test("reads each group's ci-ok and its jobs waiting for a runner with the first page only", async () => {
    const answers = recording();
    const first = answers.open.data as {
      repository: {
        mergeQueue: { entries: { nodes: { headCommit: Record<string, unknown> | null }[] } };
        pullRequests: { pageInfo: { hasNextPage: boolean; endCursor: string | null } };
      };
    };
    const entries = first.repository.mergeQueue.entries.nodes;
    const run = (name: string, status: string, conclusion: string | null, startedAt: string) => ({
      name,
      status,
      conclusion,
      startedAt,
    });
    const rollup = (nodes: unknown[]) => ({
      statusCheckRollup: { contexts: { pageInfo: { hasNextPage: false }, nodes } },
    });
    Object.assign(
      entries[0]?.headCommit ?? {},
      rollup([run("ci-ok", "COMPLETED", "SUCCESS", "2026-11-22T14:30:00Z")]),
    );
    Object.assign(
      entries[1]?.headCommit ?? {},
      rollup([
        run("Fast gates", "IN_PROGRESS", null, "2026-11-22T14:57:00Z"),
        run("Typecheck, lint, test, build (core)", "QUEUED", null, "2026-11-22T14:59:00Z"),
        run("Typecheck, lint, test, build (app-studio)", "QUEUED", null, "2026-11-22T14:58:00Z"),
      ]),
    );
    first.repository.pullRequests.pageInfo = { hasNextPage: true, endCursor: "page-2" };
    const second = {
      repository: {
        defaultBranchRef: { name: "main" },
        pullRequests: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] },
      },
    };
    const asked: unknown[] = [];
    const base = fakeQuery(answers).query;
    const snapshot = await takeSnapshot({
      token: "shared",
      query: async (document, variables) => {
        if (document.includes("query OpenPulls")) {
          asked.push(variables["withQueue"]);
          return variables["after"] === null ? first : second;
        }
        return base(document, variables);
      },
      repos,
      now: new Date("2026-11-22T15:00:00Z"),
      fallback: noFallback,
    });
    expect(asked).toEqual([true, false]);
    const [ready, building] = snapshot.repos[0]?.queue ?? [];
    expect(ready).toMatchObject({ groupCiOk: "success", jobsWaiting: 0, waitingSince: null });
    expect(building).toMatchObject({
      groupCiOk: "missing",
      jobsWaiting: 2,
      waitingSince: "2026-11-22T14:58:00Z",
    });
  });
});

verifies("paperclip.github-routes", () => {
  test("keeps a capped title and reviewers' findings as counts, never their text", async () => {
    const answers = recording();
    const page = answers.open.data as {
      repository: {
        pullRequests: {
          nodes: { number: number; title?: string; comments: { nodes: object[] } }[];
        };
      };
    };
    const node = page.repository.pullRequests.nodes.find((each) => each.number === 4965);
    if (node === undefined) throw new Error("the recording has no #4965");
    node.title = "t".repeat(300);
    node.comments.nodes.push(
      {
        databaseId: 1,
        createdAt: "2026-11-22T11:00:00Z",
        authorAssociation: "MEMBER",
        body: "[major] secret one\n- [major] two\n[nit] three",
      },
      {
        databaseId: 2,
        createdAt: "2026-11-22T11:01:00Z",
        authorAssociation: "NONE",
        body: "[blocker] from a stranger",
      },
    );
    const { query } = fakeQuery(answers);
    const snapshot = await takeSnapshot({
      token: "shared",
      query,
      repos,
      now: new Date("2026-11-22T14:10:00Z"),
      fallback: noFallback,
    });
    const pull = snapshot.repos[0]?.pulls.find((each) => each.number === 4965);
    expect(pull?.title).toHaveLength(titleCap);
    expect(pull?.open?.reviewCounts).toEqual({ blocker: 0, major: 2, minor: 0, nit: 1 });
    expect(JSON.stringify(snapshot)).not.toMatch(/secret one|stranger/);
  });
});

/** Sets `committedDate` (and more) on pull request `number`'s head commit in a recording's open page. */
function withCommittedDate(
  answers: Recording,
  number: number,
  at: string,
  extra: object = {},
): Recording {
  const page = answers.open.data as {
    repository: {
      pullRequests: { nodes: { number: number; commits: { nodes: { commit: object }[] } }[] };
    };
  };
  for (const node of page.repository.pullRequests.nodes) {
    if (node.number === number) {
      node.commits.nodes = node.commits.nodes.map(({ commit }) => ({
        commit: { ...commit, committedDate: at, ...extra },
      }));
    }
  }
  return answers;
}

verifies("paperclip.pr-watcher-answered-review", () => {
  test("keeps when the head commit was committed, so a push after a finding shows (HAL-18460)", async () => {
    const { query } = fakeQuery(withCommittedDate(recording(), 4965, "2026-11-22T13:50:00Z"));
    const snapshot = await takeSnapshot({
      token: "shared",
      query,
      repos,
      now: new Date("2026-11-22T14:10:00Z"),
      fallback: noFallback,
    });
    const pull = snapshot.repos[0]?.pulls.find((each) => each.number === 4965);
    expect(pull?.open?.headCommittedAt).toBe("2026-11-22T13:50:00Z");
    expect(pull?.open?.headCommittedByGitHub).toBeUndefined();
  });

  test("marks a head GitHub committed itself, as a rebase through the API is", async () => {
    const committer = { committer: { email: "noreply@github.com" } };
    const { query } = fakeQuery(
      withCommittedDate(recording(), 4965, "2026-11-22T13:50:00Z", committer),
    );
    const snapshot = await takeSnapshot({
      token: "shared",
      query,
      repos,
      now: new Date("2026-11-22T14:10:00Z"),
      fallback: noFallback,
    });
    const pull = snapshot.repos[0]?.pulls.find((each) => each.number === 4965);
    expect(pull?.open?.headCommittedByGitHub).toBe(true);
  });
});
