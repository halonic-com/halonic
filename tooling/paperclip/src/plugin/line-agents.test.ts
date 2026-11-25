import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { commentEvent, fakeChiefLine, lineRequest } from "./chief-line.test-helper.ts";
import { handleChiefLineRequest } from "./chief-line.ts";
import { chiefLineRouteKeys as keys } from "./chief-line-settings.ts";
import { onChiefLineComment } from "./chief-line-signal.ts";

const hook = "https://hooks.acme.test/c";

verifies("paperclip.line-agents", () => {
  test("a line to Ravi gets its own thread, assigned to Ravi, beside the chief line", async () => {
    const line = fakeChiefLine();
    const chief = await handleChiefLineRequest(
      lineRequest(keys.openThread, { caller: "sup" }),
      line.ctx,
    );
    const ravi = await handleChiefLineRequest(
      lineRequest(keys.openThread, { caller: "sup", agent: "ravi" }),
      line.ctx,
    );
    const byName = await handleChiefLineRequest(
      lineRequest(keys.openThread, { caller: "sup", agent: "Ravi" }),
      line.ctx,
    );
    expect(chief.body).toEqual({ threadId: "issue-1", identifier: "ACME-1" });
    expect(ravi.body).toEqual({ threadId: "issue-2", identifier: "ACME-2" });
    expect(byName.body).toEqual(ravi.body);
    expect(line.created).toEqual([
      expect.objectContaining({ title: "[chief-line] sup", assigneeAgentId: "agent-chief" }),
      expect.objectContaining({ title: "[line] sup → Ravi", assigneeAgentId: "agent-ravi" }),
    ]);
    const unknown = await handleChiefLineRequest(
      lineRequest(keys.openThread, { caller: "sup", agent: "nobody" }),
      line.ctx,
    );
    expect(unknown.status).toBe(404);
  });

  test("agent Chief is the chief line: same thread and title as no agent", async () => {
    const line = fakeChiefLine();
    await handleChiefLineRequest(lineRequest(keys.openThread, { caller: "sup" }), line.ctx);
    const named = await handleChiefLineRequest(
      lineRequest(keys.send, { caller: "sup", agent: "agent-chief", message: "hi" }),
      line.ctx,
    );
    expect(named.body).toMatchObject({ threadId: "issue-1", woke: true });
    expect(line.created).toHaveLength(1);
  });

  test("send to Ravi posts as the plugin on Ravi's thread and wakes it", async () => {
    const line = fakeChiefLine();
    await handleChiefLineRequest(
      lineRequest(keys.openThread, { caller: "sup", agent: "ravi" }),
      line.ctx,
    );
    const sent = await handleChiefLineRequest(
      lineRequest(keys.send, { caller: "sup", agent: "ravi", message: "status?" }),
      line.ctx,
    );
    expect(sent.body).toMatchObject({ threadId: "issue-1", woke: true });
    expect(line.comments["issue-1"]).toEqual([
      expect.objectContaining({ authorAgentId: null, authorUserId: null }),
    ]);
    expect(line.wakes.map((wake) => wake.issueId)).toEqual(["issue-1"]);
  });

  test("Ravi's reply on its line signals with agent Ravi; Chief's comment there signals nothing", async () => {
    const line = fakeChiefLine();
    await handleChiefLineRequest(
      lineRequest(keys.openThread, { caller: "sup", agent: "ravi" }),
      line.ctx,
    );
    await handleChiefLineRequest(
      lineRequest(keys.subscribe, { caller: "sup", agent: "ravi", url: hook }),
      line.ctx,
    );
    const chief = line.addComment("issue-1", "x", "agent-chief", null);
    await onChiefLineComment(line.ctx, commentEvent("issue-1", chief.id));
    expect(line.posts).toEqual([]);
    const ravi = line.addComment("issue-1", "secret", "agent-ravi", null);
    await onChiefLineComment(line.ctx, commentEvent("issue-1", ravi.id));
    expect(line.posts).toEqual([
      {
        url: hook,
        body: {
          thread: "ACME-1",
          caller: "sup",
          commentId: ravi.id,
          at: "2026-11-25T10:01:00.000Z",
          agent: "Ravi",
        },
      },
    ]);
    const human = line.addComment("issue-1", "more", null, "user-1");
    await onChiefLineComment(line.ctx, commentEvent("issue-1", human.id));
    expect(line.wakes.map((wake) => wake.issueId)).toEqual(["issue-1"]);
  });

  test("a line without its own webhook signals to the caller's chief line webhook", async () => {
    const line = fakeChiefLine();
    await handleChiefLineRequest(
      lineRequest(keys.subscribe, { caller: "sup", url: hook }),
      line.ctx,
    );
    await handleChiefLineRequest(
      lineRequest(keys.openThread, { caller: "sup", agent: "ravi" }),
      line.ctx,
    );
    const ravi = line.addComment("issue-1", "done", "agent-ravi", null);
    await onChiefLineComment(line.ctx, commentEvent("issue-1", ravi.id));
    expect(line.posts).toEqual([
      { url: hook, body: expect.objectContaining({ agent: "Ravi", caller: "sup" }) },
    ]);
  });
});

verifies("paperclip.board-post", () => {
  async function withTask() {
    const line = fakeChiefLine();
    await line.ctx.issues.create({
      companyId: "acme",
      title: "some work",
      assigneeAgentId: "agent-ravi",
    });
    return line;
  }

  test("board/post posts 'Board: ' as the plugin, with no human author, and wakes the assignee", async () => {
    const line = await withTask();
    const posted = await handleChiefLineRequest(
      lineRequest(keys.boardPost, { issue: "ACME-1", message: "please rebase" }),
      line.ctx,
    );
    expect(posted.status).toBe(200);
    expect(posted.body).toMatchObject({
      identifier: "ACME-1",
      assigneeAgentId: "agent-ravi",
      woke: true,
    });
    expect(line.comments["issue-1"]).toEqual([
      expect.objectContaining({
        body: "Board: please rebase",
        authorAgentId: null,
        authorUserId: null,
      }),
    ]);
    expect(line.wakes).toEqual([
      { issueId: "issue-1", options: expect.objectContaining({ reason: "board_post" }) },
    ]);
  });

  test("board/post keeps to the hourly limit and the length cap", async () => {
    const line = await withTask();
    const post = (message: string) =>
      handleChiefLineRequest(lineRequest(keys.boardPost, { issue: "issue-1", message }), line.ctx);
    for (const n of [1, 2, 3]) {
      expect((await post(`m${n}`)).status).toBe(200);
    }
    expect((await post("m4")).status).toBe(429);
    expect((await post("x".repeat(8001))).status).toBe(400);
    expect(line.comments["issue-1"]).toHaveLength(3);
  });

  test("board/post refuses an agent's key, an unknown task and a task with no assignee", async () => {
    const line = await withTask();
    const agent = { actorType: "agent", actorId: "a1", agentId: "a1" };
    const asAgent = await handleChiefLineRequest(
      lineRequest(keys.boardPost, { issue: "ACME-1", message: "hi" }, {}, agent),
      line.ctx,
    );
    expect(asAgent.status).toBe(403);
    const missing = await handleChiefLineRequest(
      lineRequest(keys.boardPost, { issue: "ACME-9", message: "hi" }),
      line.ctx,
    );
    expect(missing.status).toBe(404);
    await line.ctx.issues.create({ companyId: "acme", title: "unassigned" });
    const unassigned = await handleChiefLineRequest(
      lineRequest(keys.boardPost, { issue: "issue-2", message: "hi" }),
      line.ctx,
    );
    expect(unassigned.status).toBe(409);
    expect(line.comments).toEqual({});
  });
});
