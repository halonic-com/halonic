import { verifies } from "@halonicjs/testing-spec";
import { expect, test, vi } from "vitest";
import type { GitHubGet } from "../pr-watcher/github.ts";
import type { Snapshot, SnapshotPull } from "../snapshot/shape.ts";
import { fakeChiefLine, lineRequest } from "./chief-line.test-helper.ts";
import { handleChiefLineRequest } from "./chief-line.ts";
import { chiefLinePrPass, trackedPulls } from "./chief-line-prs.ts";
import { chiefLineStateKey } from "./chief-line-settings.ts";

const repo = "acme/tools";
const head = "8cc71d926".padEnd(40, "0");
const settings = {
  enabled: true,
  projectId: "proj-1",
  webhookHosts: ["hooks.acme.test"],
  maxPerHour: 3,
  prOutcomes: true,
};

/** Liam's signed verdict on #6089, as a webhook delivery and as the pass reads it. */
const verdict = {
  id: 7,
  body: "Liam: changes requested on head `8cc71d926`\n\nOne thing.",
  author_association: "MEMBER",
  created_at: "2026-11-25T13:05:27Z",
  html_url: `https://github.com/${repo}/pull/6089#c7`,
};

function setup(prOutcomes = true) {
  const line = fakeChiefLine({ config: { chiefLine: { ...settings, prOutcomes } } });
  line.issues.push({
    id: "thread-1",
    identifier: "ACME-1",
    title: "[chief-line] ci-fasttrack",
    status: "in_progress",
    projectId: "proj-1",
    createdAt: new Date("2026-11-25T08:00:00Z"),
  });
  const call = (routeKey: string, body: Record<string, unknown>) =>
    handleChiefLineRequest(lineRequest(routeKey, body), line.ctx);
  const event = (body: Record<string, unknown>) =>
    call("chief-line-pr-event", { repo, pr: 6089, ...body });
  const posts = () =>
    (line.comments["thread-1"] ?? []).filter((c) => c.body.includes("PR watcher"));
  return { line, call, event, posts };
}

/** The pass's view of #6089: the same verdict, ci-ok red on the head, or merged. */
function pass(line: ReturnType<typeof fakeChiefLine>, state: SnapshotPull["state"] = "open") {
  const pull = {
    number: 6089,
    state,
    head,
    open: state === "open" ? { ciOk: "failure" } : null,
  } as SnapshotPull;
  const get: GitHubGet = async () => [verdict];
  return chiefLinePrPass(line.ctx, {
    companyId: "acme",
    settings,
    snapshot: { repos: [{ repo, pulls: [pull] }] } as unknown as Snapshot,
    get,
    watched: [repo],
    dryRun: false,
  });
}

verifies("paperclip.chief-line-pr-hooks", () => {
  test("a webhook verdict and ci-ok post once; the pass after them posts nothing", async () => {
    const { line, call, event, posts } = setup();
    await line.ctx.state.set(chiefLineStateKey("acme", "hooks"), {
      "ci-fasttrack": "https://hooks.acme.test/s",
    });
    expect(
      (await call("chief-line-track", { caller: "ci-fasttrack", pr: 6089, repo })).status,
    ).toBe(200);
    const answer = await event({ kind: "comment", comment: verdict });
    expect(answer).toEqual({ status: 200, body: { posted: 1 } });
    expect(posts().at(-1)?.body).toContain(
      "acme/tools#6089: Liam: changes requested on head `8cc71d926`.",
    );
    // The session is signalled; Chief isn't woken.
    expect(line.posts).toHaveLength(1);
    expect(line.wakes).toEqual([]);

    expect((await event({ kind: "ci-ok", head, conclusion: "failure" })).body).toEqual({
      posted: 1,
    });
    expect(posts().at(-1)?.body).toContain("`ci-ok` red on head `8cc71d926`");
    // The same delivery again (GitHub's redelivery) posts nothing.
    expect((await event({ kind: "comment", comment: verdict })).body).toEqual({ posted: 0 });

    const count = posts().length;
    expect(await pass(line)).toBe(0);
    expect(posts()).toHaveLength(count);
  });

  test("a merge via webhook ends tracking, and the pass doesn't post it again", async () => {
    const { line, call, event, posts } = setup();
    await call("chief-line-track", { caller: "ci-fasttrack", pr: 6089, repo });
    expect((await event({ kind: "closed", merged: true })).body).toEqual({ posted: 1 });
    expect(posts().at(-1)?.body).toContain("acme/tools#6089: merged; no longer tracked.");
    expect(trackedPulls(line.comments["thread-1"] ?? [])).toEqual([]);
    const count = posts().length;
    expect(await pass(line, "merged")).toBe(0);
    expect(posts()).toHaveLength(count);
  });

  test("an untracked pull request, a stranger's verdict and a pending ci-ok post nothing", async () => {
    const { call, event, posts } = setup();
    expect((await event({ kind: "closed", merged: false })).body).toEqual({ posted: 0 });
    await call("chief-line-track", { caller: "ci-fasttrack", pr: 6089, repo });
    const stranger = { ...verdict, id: 8, author_association: "NONE" };
    expect((await event({ kind: "comment", comment: stranger })).body).toEqual({ posted: 0 });
    expect((await event({ kind: "ci-ok", head, conclusion: "cancelled" })).body).toEqual({
      posted: 0,
    });
    expect(posts()).toHaveLength(1);
  });

  test("an untracked pull request is answered without any Paperclip read", async () => {
    const { line, call, event } = setup();
    await call("chief-line-track", { caller: "ci-fasttrack", pr: 6085, repo });
    const list = vi.spyOn(line.ctx.issues, "list");
    const listComments = vi.spyOn(line.ctx.issues, "listComments");
    expect((await event({ kind: "ci-ok", head, conclusion: "failure" })).body).toEqual({
      posted: 0,
    });
    expect(list).not.toHaveBeenCalled();
    expect(listComments).not.toHaveBeenCalled();
  });

  test("after a reinstall clears the index, the pass rebuilds it from the markers", async () => {
    const { line, call, event, posts } = setup();
    await call("chief-line-track", { caller: "ci-fasttrack", pr: 6089, repo });
    await line.ctx.state.set(chiefLineStateKey("acme", "tracked"), {});
    // The webhook skips it now; the pass posts it and rebuilds the index.
    expect((await event({ kind: "comment", comment: verdict })).body).toEqual({ posted: 0 });
    expect(await pass(line)).toBe(1);
    expect(await line.ctx.state.get(chiefLineStateKey("acme", "tracked"))).toEqual({
      [`${repo}#6089`]: ["ci-fasttrack"],
    });
    const count = posts().length;
    expect((await event({ kind: "closed", merged: true })).body).toEqual({ posted: 1 });
    expect(posts()).toHaveLength(count + 1);
    // The merge ends tracking, so the next pass drops it from the index.
    await pass(line, "merged");
    expect(await line.ctx.state.get(chiefLineStateKey("acme", "tracked"))).toEqual({});
  });

  test("bad events, an agent's key and the switch off are refused", async () => {
    const { line, event } = setup();
    expect((await event({ kind: "ci-ok", head: "abc", conclusion: "failure" })).status).toBe(400);
    expect((await event({ kind: "comment", comment: { id: "7" } })).status).toBe(400);
    expect((await event({ kind: "push" })).status).toBe(400);
    const agent = lineRequest(
      "chief-line-pr-event",
      { repo, pr: 6089, kind: "closed", merged: true },
      {},
      { actorType: "agent" },
    );
    expect((await handleChiefLineRequest(agent, line.ctx)).status).toBe(403);
    const off = setup(false);
    expect((await off.event({ kind: "closed", merged: true })).status).toBe(409);
  });
});
