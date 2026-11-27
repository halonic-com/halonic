import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { fakeChiefLine, lineRequest } from "./chief-line.test-helper.ts";
import { handleChiefLineRequest } from "./chief-line.ts";
import { chiefLineRouteKeys as keys, readChiefLineSettings } from "./chief-line-settings.ts";

/** A line with one task, ACME-1, assigned to Ravi, in the given status and with the given title. */
async function withTask(
  status: "todo" | "done" | "cancelled",
  title = "some work",
  config?: Record<string, unknown>,
) {
  const line = fakeChiefLine(config === undefined ? {} : { config });
  await line.ctx.issues.create({ companyId: "acme", title, status, assigneeAgentId: "agent-ravi" });
  return line;
}

const post = (line: ReturnType<typeof fakeChiefLine>, issue = "ACME-1") =>
  handleChiefLineRequest(lineRequest(keys.boardPost, { issue, message: "fyi" }), line.ctx);

const lineConfig = (noPostTasks: string[]) => ({
  chiefLine: { enabled: true, projectId: "proj-1", maxPerHour: 3, noPostTasks },
});

verifies("paperclip.board-post-guards", () => {
  for (const status of ["done", "cancelled"] as const) {
    test(`board/post on a ${status} task posts the comment only: no reopen, no wake`, async () => {
      const line = await withTask(status);
      const posted = await post(line);
      expect(posted.status).toBe(200);
      expect(posted.body).toMatchObject({ identifier: "ACME-1", woke: false });
      expect(String((posted.body as { note: string }).note)).toContain(`is ${status}: posted only`);
      expect(line.comments["issue-1"]).toEqual([
        expect.objectContaining({ body: "Board: fyi", authorAgentId: null, authorUserId: null }),
      ]);
      expect(line.updates).toEqual([]);
      expect(line.wakes).toEqual([]);
      expect(line.issues[0]?.status).toBe(status);
    });
  }

  test("board/post on a todo task still wakes it", async () => {
    const line = await withTask("todo");
    expect((await post(line)).body).toMatchObject({ woke: true });
    expect(line.wakes.map((wake) => wake.issueId)).toEqual(["issue-1"]);
  });

  test("board/post refuses a task in noPostTasks with 403 and posts nothing", async () => {
    const line = await withTask("todo", "some work", lineConfig(["ACME-1"]));
    const byIdentifier = await post(line, "ACME-1");
    const byId = await post(line, "issue-1");
    for (const refused of [byIdentifier, byId]) {
      expect(refused.status).toBe(403);
      expect(String((refused.body as { error: string }).error)).toContain(
        "ACME-1 is the board's own chat",
      );
    }
    expect(line.comments).toEqual({});
    expect(line.wakes).toEqual([]);
  });

  test("board/post refuses a 'Chat with …' task with 403 and posts nothing", async () => {
    const line = await withTask("todo", "Chat with Liam");
    const refused = await post(line);
    expect(refused.status).toBe(403);
    expect(line.comments).toEqual({});
    expect(line.wakes).toEqual([]);
  });

  test("the refusal doesn't use up the hourly limit", async () => {
    const line = await withTask("todo", "Chat with Liam");
    await line.ctx.issues.create({ companyId: "acme", title: "w", assigneeAgentId: "agent-ravi" });
    for (const _ of [1, 2, 3, 4]) {
      expect((await post(line, "ACME-1")).status).toBe(403);
    }
    expect((await post(line, "ACME-2")).status).toBe(200);
  });

  test("noPostTasks defaults to HAL-10 and HAL-45, and the board can replace the list", () => {
    expect(readChiefLineSettings({ chiefLine: {} }).noPostTasks).toEqual(["HAL-10", "HAL-45"]);
    expect(readChiefLineSettings({ chiefLine: { noPostTasks: ["hal-7", 3] } }).noPostTasks).toEqual(
      ["HAL-7"],
    );
    expect(readChiefLineSettings({ chiefLine: { noPostTasks: [] } }).noPostTasks).toEqual([]);
  });
});
