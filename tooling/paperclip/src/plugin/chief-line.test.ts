import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { commentEvent, fakeChiefLine, lineRequest } from "./chief-line.test-helper.ts";
import { handleChiefLineRequest } from "./chief-line.ts";
import { chiefLineRouteKeys as keys } from "./chief-line-settings.ts";
import { onChiefLineComment } from "./chief-line-signal.ts";
import { manifest } from "./manifest.ts";

verifies("paperclip.chief-line", () => {
  test("the manifest declares the three routes board-only", () => {
    const routes = manifest.apiRoutes?.filter((route) => route.routeKey.startsWith("chief-line"));
    expect(routes?.map((route) => [route.method, route.path, route.auth])).toEqual([
      ["POST", "/chief-line/thread", "board"],
      ["GET", "/chief-line/thread", "board"],
      ["POST", "/chief-line/subscribe", "board"],
    ]);
  });

  test("an agent's key is refused, and so is every call while the line is off", async () => {
    const agent = { actorType: "agent", actorId: "a1", agentId: "a1" };
    const on = fakeChiefLine();
    expect(
      (await handleChiefLineRequest(lineRequest(keys.openThread, {}, {}, agent), on.ctx)).status,
    ).toBe(403);
    const off = fakeChiefLine({ config: {} });
    const sent = await handleChiefLineRequest(
      lineRequest(keys.openThread, { caller: "sup" }),
      off.ctx,
    );
    expect(sent.status).toBe(409);
    expect(off.created).toEqual([]);
  });

  test("POST thread finds or creates the thread, and a bad caller name is refused", async () => {
    const line = fakeChiefLine();
    const open = await handleChiefLineRequest(
      lineRequest(keys.openThread, { caller: "studio" }),
      line.ctx,
    );
    expect(open.body).toEqual({ threadId: "issue-1", identifier: "ACME-1" });
    expect(line.created).toEqual([
      expect.objectContaining({
        title: "[chief-line] studio",
        assigneeAgentId: "agent-chief",
        projectId: "proj-1",
      }),
    ]);
    await handleChiefLineRequest(lineRequest(keys.openThread, { caller: "studio" }), line.ctx);
    expect(line.created).toHaveLength(1);
    const bad = await handleChiefLineRequest(
      lineRequest(keys.openThread, { caller: "Bad Name" }),
      line.ctx,
    );
    expect(bad.status).toBe(400);
  });

  test("subscribe accepts only an allowed host", async () => {
    const line = fakeChiefLine();
    const subscribe = (url: string) =>
      handleChiefLineRequest(lineRequest(keys.subscribe, { caller: "sup", url }), line.ctx);
    expect((await subscribe("https://evil.test/hook")).status).toBe(400);
    expect((await subscribe("https://user:pw@hooks.acme.test/x")).status).toBe(400);
    expect((await subscribe("https://hooks.acme.test/chief")).status).toBe(200);
    const none = fakeChiefLine({ config: { chiefLine: { enabled: true, projectId: "p" } } });
    const refused = await handleChiefLineRequest(
      lineRequest(keys.subscribe, { caller: "sup", url: "https://hooks.acme.test/chief" }),
      none.ctx,
    );
    expect(refused.status).toBe(400);
  });

  test("GET thread lists comments after since, with author kind and time", async () => {
    const line = fakeChiefLine();
    await handleChiefLineRequest(lineRequest(keys.openThread, { caller: "sup" }), line.ctx);
    line.addComment("issue-1", "first", null, "user-1");
    line.addComment("issue-1", "answer", "agent-chief", null);
    const read = await handleChiefLineRequest(
      lineRequest(keys.thread, undefined, { caller: "sup", since: "2026-11-25T10:00:30.000Z" }),
      line.ctx,
    );
    expect(read.body).toMatchObject({
      comments: [
        { id: "c2", authorKind: "agent", createdAt: "2026-11-25T10:01:00.000Z", body: "answer" },
      ],
    });
  });

  test("the signal fires only for Chief's comments on a chief-line thread, without the body, retrying once", async () => {
    const line = fakeChiefLine({ hookStatuses: [500, 200] });
    await handleChiefLineRequest(lineRequest(keys.openThread, { caller: "sup" }), line.ctx);
    await handleChiefLineRequest(
      lineRequest(keys.subscribe, { caller: "sup", url: "https://hooks.acme.test/c" }),
      line.ctx,
    );
    const other = await line.ctx.issues.create({ companyId: "acme", title: "elsewhere" });
    const offThread = line.addComment(other.id, "secret", "agent-chief", null);
    await onChiefLineComment(line.ctx, commentEvent(other.id, offThread.id));
    const ravi = line.addComment("issue-1", "secret", "agent-ravi", null);
    await onChiefLineComment(line.ctx, commentEvent("issue-1", ravi.id));
    expect(line.posts).toEqual([]);
    const chief = line.addComment("issue-1", "secret answer", "agent-chief", null);
    await onChiefLineComment(line.ctx, commentEvent("issue-1", chief.id));
    const signal = {
      thread: "ACME-1",
      caller: "sup",
      commentId: chief.id,
      at: "2026-11-25T10:01:00.000Z",
    };
    expect(line.posts).toEqual([
      { url: "https://hooks.acme.test/c", body: signal },
      { url: "https://hooks.acme.test/c", body: signal },
    ]);
    expect(JSON.stringify(line.posts)).not.toContain("secret");
  });

  test("a failed signal is retried once, then logged, never thrown", async () => {
    const line = fakeChiefLine({ hookStatuses: [500, 502, 200] });
    await handleChiefLineRequest(lineRequest(keys.openThread, { caller: "sup" }), line.ctx);
    await handleChiefLineRequest(
      lineRequest(keys.subscribe, { caller: "sup", url: "https://hooks.acme.test/c" }),
      line.ctx,
    );
    const chief = line.addComment("issue-1", "answer", "agent-chief", null);
    await expect(
      onChiefLineComment(line.ctx, commentEvent("issue-1", chief.id)),
    ).resolves.toBeUndefined();
    expect(line.posts).toHaveLength(2);
    expect(line.logs).toContain("Chief line: the reply signal failed twice.");
  });

  test("a comment the caller posts itself wakes Chief, within the hourly limit", async () => {
    const line = fakeChiefLine();
    await handleChiefLineRequest(lineRequest(keys.openThread, { caller: "sup" }), line.ctx);
    for (let index = 0; index < 4; index += 1) {
      const posted = line.addComment("issue-1", "q", null, "user-1");
      await onChiefLineComment(line.ctx, commentEvent("issue-1", posted.id));
    }
    expect(line.wakes.map((wake) => wake.options)).toEqual(
      ["c1", "c2", "c3"].map((id) => ({
        reason: "chief_line",
        idempotencyKey: `chief-line ${id}`,
      })),
    );
  });

  test("a cancelled or renamed stored thread is ignored; the newest live [chief-line] task is used and signals", async () => {
    const line = fakeChiefLine();
    await handleChiefLineRequest(lineRequest(keys.openThread, { caller: "sup" }), line.ctx);
    await handleChiefLineRequest(
      lineRequest(keys.subscribe, { caller: "sup", url: "https://hooks.acme.test/c" }),
      line.ctx,
    );
    const [old] = line.issues;
    if (old === undefined) throw new Error("no thread");
    old.status = "cancelled";
    old.title = "[chief-line] sup (old)";
    // The board makes the new thread itself; a cancelled one with the exact title is skipped.
    await line.ctx.issues.create({
      title: "[chief-line] sup",
      status: "cancelled",
      projectId: "proj-1",
    } as never);
    await line.ctx.issues.create({
      title: "[chief-line] sup",
      status: "done",
      projectId: "proj-1",
    } as never);
    const opened = await handleChiefLineRequest(
      lineRequest(keys.openThread, { caller: "sup" }),
      line.ctx,
    );
    expect(opened.body).toEqual({ threadId: "issue-3", identifier: "ACME-3" });
    const chief = line.addComment("issue-3", "answer", "agent-chief", null);
    await onChiefLineComment(line.ctx, commentEvent("issue-3", chief.id));
    expect(line.posts).toEqual([
      {
        url: "https://hooks.acme.test/c",
        body: {
          thread: "ACME-3",
          caller: "sup",
          commentId: chief.id,
          at: "2026-11-25T10:00:00.000Z",
        },
      },
    ]);
  });

  test("the signal finds a thread by its title even before the plugin stored it, only in the line's project", async () => {
    const line = fakeChiefLine();
    await handleChiefLineRequest(
      lineRequest(keys.subscribe, { caller: "studio", url: "https://hooks.acme.test/s" }),
      line.ctx,
    );
    const elsewhere = await line.ctx.issues.create({
      title: "[chief-line] studio",
      projectId: "proj-2",
    } as never);
    const a = line.addComment(elsewhere.id, "x", "agent-chief", null);
    await onChiefLineComment(line.ctx, commentEvent(elsewhere.id, a.id));
    expect(line.posts).toEqual([]);
    const own = await line.ctx.issues.create({
      title: "[chief-line] studio",
      projectId: "proj-1",
    } as never);
    const b = line.addComment(own.id, "y", "agent-chief", null);
    await onChiefLineComment(line.ctx, commentEvent(own.id, b.id));
    expect(line.posts).toHaveLength(1);
  });
});
