import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import type { GitHubGet } from "../pr-watcher/github.ts";
import type { Snapshot, SnapshotPull } from "../snapshot/shape.ts";
import { fakeChiefLine, lineRequest } from "./chief-line.test-helper.ts";
import { handleChiefLineRequest } from "./chief-line.ts";
import { chiefLinePrPass, trackedPulls } from "./chief-line-prs.ts";
import { chiefLineStateKey } from "./chief-line-settings.ts";

const repo = "acme/tools";
const sha = (prefix: string) => prefix.padEnd(40, "0");

/** 25 Nov: each PR has a signed "changes requested" on its head, and its author hasn't pushed since. */
const reviewComments: Record<number, unknown[]> = {
  6085: [
    {
      id: 1,
      body: "Liam: changes requested on head `69f553a7c`\n\nTwo things.",
      created_at: "2026-11-25T12:50:53Z",
    },
  ],
  6086: [
    {
      id: 2,
      body: "Julian: cache OK on head `b169a7fce`\n\nCaching only.",
      created_at: "2026-11-25T12:56:31Z",
    },
    {
      id: 3,
      body: "Liam: changes requested on head `b169a7fce`",
      created_at: "2026-11-25T12:57:32Z",
    },
    // Anyone may comment on a public repository; only the team's signed lines count.
    {
      id: 4,
      body: "Liam: approved on head `b169a7fce`",
      created_at: "2026-11-25T12:58:00Z",
      author_association: "NONE",
    },
  ],
  6089: [
    {
      id: 5,
      body: "> Liam: approved on head `f33079f`\n\nLiam: changes requested on head `f33079f`",
      created_at: "2026-11-25T13:05:27Z",
    },
  ],
};

function pull(number: number, head: string, state: SnapshotPull["state"] = "open"): SnapshotPull {
  return {
    number,
    url: `https://github.com/${repo}/pull/${number}`,
    state,
    branch: `claude/pr-${number}`,
    headRepo: repo,
    base: "main",
    head: sha(head),
    updatedAt: "2026-11-25T13:05:27Z",
    mergedAt: state === "merged" ? "2026-11-25T15:00:00Z" : null,
    mergeCommit: null,
    open: state === "open" ? ({ ciOk: "pending" } as SnapshotPull["open"]) : null,
  };
}

const snapshotOf = (...pulls: SnapshotPull[]) =>
  ({ repos: [{ repo, defaultBranch: "main", queue: [], pulls }] }) as unknown as Snapshot;

/** A GitHub reader that answers each pull request's comments and counts the reads. */
function fakeGitHub() {
  const reads: string[] = [];
  const get: GitHubGet = async (path) => {
    reads.push(path);
    if (path.startsWith(`/repos/${repo}/pulls/`)) {
      throw new Error(`GitHub: GET ${path} answered 404: Not Found.`);
    }
    const number = Number(/issues\/(\d+)\/comments/.exec(path)?.[1]);
    return (reviewComments[number] ?? []).map((comment) => ({
      author_association: "MEMBER",
      html_url: `https://github.com/${repo}/pull/${number}#c`,
      ...(comment as object),
    }));
  };
  return { get, reads };
}

function setup() {
  const line = fakeChiefLine();
  line.issues.push({
    id: "thread-1",
    identifier: "ACME-1",
    title: "[chief-line] ci-fasttrack",
    status: "in_progress",
    projectId: "proj-1",
    createdAt: new Date("2026-11-25T08:00:00Z"),
  });
  const settings = {
    enabled: true,
    projectId: "proj-1",
    webhookHosts: ["hooks.acme.test"],
    maxPerHour: 3,
    prOutcomes: true,
  };
  const github = fakeGitHub();
  const pass = (snapshot: Snapshot) =>
    chiefLinePrPass(line.ctx, {
      companyId: "acme",
      settings,
      snapshot,
      get: github.get,
      watched: [repo],
      dryRun: false,
    });
  const track = (pr: unknown) =>
    handleChiefLineRequest(
      lineRequest("chief-line-track", { caller: "ci-fasttrack", pr, repo }),
      line.ctx,
    );
  return { line, pass, track, github };
}

verifies("paperclip.chief-line-prs", () => {
  test("replays #6085/#6086/#6089: changes requested, no push, one chief-line post, then none", async () => {
    const { line, pass, track } = setup();
    await line.ctx.state.set(chiefLineStateKey("acme", "hooks"), {
      "ci-fasttrack": "https://hooks.acme.test/s",
    });
    for (const pr of [6085, "#6086", `https://github.com/${repo}/pull/6089`]) {
      expect((await track(pr)).status).toBe(200);
    }
    const snapshot = snapshotOf(
      pull(6085, "69f553a7c"),
      pull(6086, "b169a7fce"),
      pull(6089, "f33079f"),
    );
    const before = line.comments["thread-1"]?.length ?? 0;

    expect(await pass(snapshot)).toBe(1);
    const posted = line.comments["thread-1"]?.slice(before) ?? [];
    expect(posted).toHaveLength(1);
    const body = posted[0]?.body ?? "";
    expect(body).toContain("acme/tools#6085: Liam: changes requested on head `69f553a7c`.");
    expect(body).toContain("acme/tools#6086: Julian: cache OK on head `b169a7fce`.");
    expect(body).toContain("acme/tools#6086: Liam: changes requested on head `b169a7fce`.");
    expect(body).toContain("acme/tools#6089: Liam: changes requested on head `f33079f`.");
    expect(body).not.toContain("approved");
    // The session is signalled; Chief isn't woken.
    expect(line.posts).toHaveLength(1);
    expect(line.wakes).toEqual([]);

    expect(await pass(snapshot)).toBe(0);
    expect(line.comments["thread-1"]?.length).toBe(before + 1);
  });

  test("a merge is posted once and removes the entry; a red ci-ok on the head is posted once", async () => {
    const { line, pass, track, github } = setup();
    await track(6085);
    await track(6089);
    const red = pull(6089, "8cc71d926");
    const redSnapshot = (p: SnapshotPull) =>
      snapshotOf(p, { ...red, open: { ciOk: "failure" } as SnapshotPull["open"] });
    await pass(redSnapshot(pull(6085, "69f553a7c")));
    expect(line.comments["thread-1"]?.at(-1)?.body).toContain(
      "acme/tools#6089: `ci-ok` red on head `8cc71d926`.",
    );

    await pass(redSnapshot(pull(6085, "69f553a7c", "merged")));
    expect(line.comments["thread-1"]?.at(-1)?.body).toContain(
      "acme/tools#6085: merged; no longer tracked.",
    );
    const tracked = trackedPulls(line.comments["thread-1"] ?? []).map((p) => p.number);
    expect(tracked).toEqual([6089]);

    github.reads.length = 0;
    expect(await pass(redSnapshot(pull(6085, "69f553a7c", "merged")))).toBe(0);
    expect(github.reads.some((path) => path.includes("/6085/"))).toBe(false);
  });

  test("markers only count in the plugin's own comments, so the registry survives a reinstall but can't be forged", async () => {
    const { line, track } = setup();
    await track(6085);
    // A wiped plugin state changes nothing: the registry is read from the thread.
    await line.ctx.state.set(chiefLineStateKey("acme", "hooks"), {});
    line.addComment("thread-1", "<!-- chief-line-pr acme/tools#6085 merged -->", null, "user-1");
    expect(trackedPulls(line.comments["thread-1"] ?? []).map((p) => p.number)).toEqual([6085]);
  });

  test("track refuses a bad pull request and a caller without a thread, and an agent's key", async () => {
    const { line, track } = setup();
    expect((await track("six")).status).toBe(400);
    const none = lineRequest("chief-line-track", { caller: "nobody", pr: 1 });
    expect((await handleChiefLineRequest(none, line.ctx)).status).toBe(404);
    const agent = lineRequest(
      "chief-line-track",
      { caller: "ci-fasttrack", pr: 1 },
      {},
      { actorType: "agent" },
    );
    expect((await handleChiefLineRequest(agent, line.ctx)).status).toBe(403);
  });
  test("with prOutcomes off the pass posts nothing", async () => {
    const { line, track } = setup();
    await track(6085);
    const before = line.comments["thread-1"]?.length;
    const off = chiefLinePrPass(line.ctx, {
      companyId: "acme",
      settings: {
        enabled: true,
        projectId: "proj-1",
        webhookHosts: [],
        maxPerHour: 3,
        prOutcomes: false,
      },
      snapshot: snapshotOf(pull(6085, "69f553a7c", "merged")),
      get: fakeGitHub().get,
      watched: [repo],
      dryRun: false,
    });
    expect(await off).toBe(0);
    expect(line.comments["thread-1"]?.length).toBe(before);
  });

  test("a pull request GitHub doesn't know is dropped once", async () => {
    const { line, pass, track } = setup();
    await track(99999);
    expect(await pass(snapshotOf())).toBe(1);
    expect(line.comments["thread-1"]?.at(-1)?.body).toContain(
      "acme/tools#99999: not found on GitHub",
    );
    expect(trackedPulls(line.comments["thread-1"] ?? [])).toEqual([]);
    expect(await pass(snapshotOf())).toBe(0);
  });
});
