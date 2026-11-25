import { verifies } from "@halonicjs/testing-spec";
import { expect, test } from "vitest";
import { commentEvent, fakeChiefLine, lineRequest } from "./chief-line.test-helper.ts";
import { handleChiefLineRequest } from "./chief-line.ts";
import { chiefLineRouteKeys as keys } from "./chief-line-settings.ts";
import { onChiefLineComment } from "./chief-line-signal.ts";

verifies("paperclip.line-unblock", () => {
  const followUp = { id: "issue-9", identifier: "ACME-9", status: "todo" };

  test("a send on a blocked chief line removes the blockers, logs them and wakes Chief", async () => {
    const line = fakeChiefLine();
    await handleChiefLineRequest(lineRequest(keys.openThread, { caller: "sup" }), line.ctx);
    line.blockers["issue-1"] = [followUp];
    const sent = await handleChiefLineRequest(
      lineRequest(keys.send, { caller: "sup", message: "status?" }),
      line.ctx,
    );
    expect(sent.body).toMatchObject({ threadId: "issue-1", woke: true });
    expect(line.removedBlockers).toEqual([{ issueId: "issue-1", ids: ["issue-9"] }]);
    expect(line.wakes.map((wake) => wake.issueId)).toEqual(["issue-1"]);
    expect(line.logs).toContain(
      "Chief line: removed blockers from a line thread before waking it.",
    );
  });

  test("a human's comment on a blocked line to Ravi unblocks and wakes Ravi", async () => {
    const line = fakeChiefLine();
    await handleChiefLineRequest(
      lineRequest(keys.openThread, { caller: "sup", agent: "ravi" }),
      line.ctx,
    );
    line.blockers["issue-1"] = [followUp];
    const comment = line.addComment("issue-1", "hello", null, "user-1");
    await onChiefLineComment(line.ctx, commentEvent("issue-1", comment.id));
    expect(line.removedBlockers).toEqual([{ issueId: "issue-1", ids: ["issue-9"] }]);
    expect(line.wakes.map((wake) => wake.issueId)).toEqual(["issue-1"]);
  });

  test("board/post on a blocked ordinary task posts, touches nothing and answers 409", async () => {
    const line = fakeChiefLine();
    await line.ctx.issues.create({
      companyId: "acme",
      title: "some work",
      status: "blocked",
      assigneeAgentId: "agent-ravi",
    });
    line.blockers["issue-1"] = [{ ...followUp, status: "in_progress" }];
    const posted = await handleChiefLineRequest(
      lineRequest(keys.boardPost, { issue: "ACME-1", message: "please rebase" }),
      line.ctx,
    );
    expect(posted.status).toBe(409);
    expect(posted.body).toMatchObject({ blockedBy: ["ACME-9"], woke: false });
    expect(String((posted.body as { error: string }).error)).toContain(
      "is blocked by ACME-9, not woken",
    );
    expect(line.comments["issue-1"]).toHaveLength(1);
    expect(line.removedBlockers).toEqual([]);
    expect(line.updates).toEqual([]);
    expect(line.wakes).toEqual([]);
  });

  test("board/post on a task whose blockers are all done still wakes it", async () => {
    const line = fakeChiefLine();
    await line.ctx.issues.create({ companyId: "acme", title: "w", assigneeAgentId: "agent-ravi" });
    line.blockers["issue-1"] = [{ ...followUp, status: "done" }];
    const posted = await handleChiefLineRequest(
      lineRequest(keys.boardPost, { issue: "ACME-1", message: "go" }),
      line.ctx,
    );
    expect(posted.body).toMatchObject({ woke: true });
    expect(line.removedBlockers).toEqual([]);
  });
});
