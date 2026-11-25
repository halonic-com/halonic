import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { commentEvent, fakeChiefLine, lineRequest } from "./chief-line.test-helper.ts";
import { handleChiefLineRequest } from "./chief-line.ts";
import { chiefLineRouteKeys as keys } from "./chief-line-settings.ts";
import { onChiefLineComment } from "./chief-line-signal.ts";
import { manifest } from "./manifest.ts";

verifies("paperclip.chief-line", () => {
  test("the manifest declares the six routes board-only", () => {
    const routes = manifest.apiRoutes?.filter((route) => route.routeKey.startsWith("chief-line"));
    expect(routes?.map((route) => [route.method, route.path, route.auth])).toEqual([
      ["POST", "/chief-line/thread", "board"],
      ["GET", "/chief-line/thread", "board"],
      ["POST", "/chief-line/send", "board"],
      ["POST", "/chief-line/subscribe", "board"],
      ["POST", "/chief-line/track", "board"],
      ["POST", "/chief-line/pr-event", "board"],
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
      agent: "Chief",
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
          agent: "Chief",
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

  test("send posts as the plugin with the header and wakes Chief once", async () => {
    const line = fakeChiefLine();
    await handleChiefLineRequest(lineRequest(keys.openThread, { caller: "sup" }), line.ctx);
    const sent = await handleChiefLineRequest(
      lineRequest(keys.send, { caller: "sup", message: "How is the queue?" }),
      line.ctx,
    );
    expect(sent).toEqual({
      status: 200,
      body: { threadId: "issue-1", identifier: "ACME-1", commentId: "c1", woke: true },
    });
    const [comment] = line.comments["issue-1"] ?? [];
    expect(comment?.body).toBe("**From sup (chief line)**\n\nHow is the queue?");
    expect(line.createCommentOptions).toEqual([undefined]);
    await onChiefLineComment(line.ctx, commentEvent("issue-1", "c1"));
    expect(line.wakes).toEqual([
      { issueId: "issue-1", options: { reason: "chief_line", idempotencyKey: "chief-line c1" } },
    ]);
  });

  test("send needs an existing thread and keeps to the hourly limit", async () => {
    const line = fakeChiefLine();
    const send = () =>
      handleChiefLineRequest(lineRequest(keys.send, { caller: "sup", message: "x" }), line.ctx);
    const missing = await send();
    expect(missing.status).toBe(404);
    expect(line.created).toEqual([]);
    await line.ctx.issues.create({ title: "[chief-line] sup", projectId: "proj-1" } as never);
    for (let index = 0; index < 3; index += 1) {
      expect((await send()).status).toBe(200);
    }
    expect(await send()).toEqual({
      status: 429,
      body: { error: "Too many messages: sup may send 3 per hour." },
    });
    expect(line.wakes).toHaveLength(3);
  });

  test("a comment with no author or by another agent doesn't wake Chief; a human's does", async () => {
    const line = fakeChiefLine();
    await handleChiefLineRequest(lineRequest(keys.openThread, { caller: "sup" }), line.ctx);
    const system = line.addComment("issue-1", "status changed", null, null);
    await onChiefLineComment(line.ctx, commentEvent("issue-1", system.id));
    const ravi = line.addComment("issue-1", "note", "agent-ravi", null);
    await onChiefLineComment(line.ctx, commentEvent("issue-1", ravi.id));
    expect(line.wakes).toEqual([]);
    const human = line.addComment("issue-1", "q", null, "user-1");
    await onChiefLineComment(line.ctx, commentEvent("issue-1", human.id));
    expect(line.wakes).toHaveLength(1);
  });

  test("without an agent named Chief, comments wake nothing and signal nothing, logged once", async () => {
    const line = fakeChiefLine();
    await handleChiefLineRequest(lineRequest(keys.openThread, { caller: "sup" }), line.ctx);
    await handleChiefLineRequest(
      lineRequest(keys.subscribe, { caller: "sup", url: "https://hooks.acme.test/c" }),
      line.ctx,
    );
    line.agents.splice(0, line.agents.length, { id: "agent-ravi", name: "Ravi", urlKey: "ravi" });
    const ctx = {
      ...line.ctx,
      config: {
        get: async () => ({
          chiefLine: {
            enabled: true,
            projectId: "proj-1",
            webhookHosts: ["hooks.acme.test"],
            maxPerHour: 3,
          },
        }),
      },
    };
    const event = (issueId: string, commentId: string) => ({
      ...commentEvent(issueId, commentId),
      companyId: "no-chief",
    });
    const human = line.addComment("issue-1", "q", null, "user-1");
    await onChiefLineComment(ctx as typeof line.ctx, event("issue-1", human.id));
    const old = line.addComment("issue-1", "a", "agent-chief", null);
    await onChiefLineComment(ctx as typeof line.ctx, event("issue-1", old.id));
    expect(line.wakes).toEqual([]);
    expect(line.posts).toEqual([]);
    expect(line.logs.filter((log) => log.includes("no agent named Chief"))).toHaveLength(1);
  });

  test("GET thread skips a cancelled or renamed stored thread, rediscovers, or answers 404", async () => {
    const line = fakeChiefLine();
    await handleChiefLineRequest(lineRequest(keys.openThread, { caller: "sup" }), line.ctx);
    const [old] = line.issues;
    if (old === undefined) throw new Error("no thread");
    old.status = "cancelled";
    const read = () =>
      handleChiefLineRequest(lineRequest(keys.thread, undefined, { caller: "sup" }), line.ctx);
    expect((await read()).status).toBe(404);
    await line.ctx.issues.create({ title: "[chief-line] sup", projectId: "proj-1" } as never);
    expect((await read()).body).toMatchObject({ threadId: "issue-2", identifier: "ACME-2" });
  });

  test("a send to a backlog or done thread moves it to todo before waking Chief", async () => {
    const line = fakeChiefLine();
    await handleChiefLineRequest(lineRequest(keys.openThread, { caller: "sup" }), line.ctx);
    const [thread] = line.issues;
    if (thread === undefined) throw new Error("no thread");
    for (const status of ["backlog", "done"]) {
      thread.status = status;
      const sent = await handleChiefLineRequest(
        lineRequest(keys.send, { caller: "sup", message: "x" }),
        line.ctx,
      );
      expect(sent.status).toBe(200);
      expect(sent.body).toMatchObject({ woke: true });
      expect(thread.status).toBe("todo");
    }
    expect(line.updates).toEqual([
      { issueId: "issue-1", patch: { status: "todo" } },
      { issueId: "issue-1", patch: { status: "todo" } },
    ]);
    expect(line.wakes).toHaveLength(2);
  });

  test("a failed wake after the post is logged, and send still answers 200 with woke false", async () => {
    const line = fakeChiefLine();
    await handleChiefLineRequest(lineRequest(keys.openThread, { caller: "sup" }), line.ctx);
    line.failWakes();
    const sent = await handleChiefLineRequest(
      lineRequest(keys.send, { caller: "sup", message: "x" }),
      line.ctx,
    );
    expect(sent).toEqual({
      status: 200,
      body: { threadId: "issue-1", identifier: "ACME-1", commentId: "c1", woke: false },
    });
    expect(line.logs).toContain("Chief line: couldn't wake the task's agent.");
  });

  test("a human's comment on a backlog thread reopens it and wakes Chief", async () => {
    const line = fakeChiefLine();
    await handleChiefLineRequest(lineRequest(keys.openThread, { caller: "sup" }), line.ctx);
    const [thread] = line.issues;
    if (thread === undefined) throw new Error("no thread");
    thread.status = "backlog";
    const human = line.addComment("issue-1", "q", null, "user-1");
    await onChiefLineComment(line.ctx, commentEvent("issue-1", human.id));
    expect(thread.status).toBe("todo");
    expect(line.wakes).toHaveLength(1);
    expect(line.logs).not.toContain("Chief line: couldn't handle a new comment.");
  });

  test("a 204 from the webhook counts as delivered, not as a failed signal", async () => {
    const line = fakeChiefLine({ hookStatuses: [204] });
    await handleChiefLineRequest(lineRequest(keys.openThread, { caller: "sup" }), line.ctx);
    await handleChiefLineRequest(
      lineRequest(keys.subscribe, { caller: "sup", url: "https://hooks.acme.test/c" }),
      line.ctx,
    );
    const chief = line.addComment("issue-1", "answer", "agent-chief", null);
    await onChiefLineComment(line.ctx, commentEvent("issue-1", chief.id));
    expect(line.posts).toHaveLength(1);
    expect(line.logs).not.toContain("Chief line: the reply signal failed twice.");
  });

  test("a send to a blocked thread moves it to todo and wakes Chief", async () => {
    const line = fakeChiefLine();
    await handleChiefLineRequest(lineRequest(keys.openThread, { caller: "sup" }), line.ctx);
    const [thread] = line.issues;
    if (thread === undefined) throw new Error("no thread");
    thread.status = "blocked";
    const sent = await handleChiefLineRequest(
      lineRequest(keys.send, { caller: "sup", message: "x" }),
      line.ctx,
    );
    expect(sent.body).toMatchObject({ woke: true });
    expect(thread.status).toBe("todo");
  });
});
