import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { taskOfBranch, waitTimeoutMs } from "./precheck-waits.ts";
import {
  branch,
  checkId,
  fakePrecheck,
  heldTask,
  passed,
  queued,
  running,
  sha,
} from "./ready-for-review.test-helper.ts";

const checkUrl = `http://halonic-precheck:8787/check/${checkId}`;
const failed = {
  status: 200,
  body: {
    id: checkId,
    status: "done",
    pass: false,
    failed: ["format"],
    summary: "[format]\nsrc/acme.ts: File content differs",
    durationS: 40,
  },
};

/** A check the tool answered RUNNING for, kept for HAL-1. */
async function keptCheck() {
  const fake = fakePrecheck([queued, running, running], { tasks: [{ ...heldTask }] });
  const first = await fake.call({ branch, sha });
  fake.sent.length = 0;
  return { ...fake, first };
}

verifies("paperclip.ready-for-review-wake", () => {
  describe("ready_for_review wakes the task when its check is done", () => {
    test("a RUNNING answer for a task the agent holds says the plugin wakes it there", async () => {
      const { first } = await keptCheck();
      expect(first.error).toBeUndefined();
      expect(first.content).toMatch(
        new RegExp(
          `^RUNNING: check ${checkId} isn't done yet .*Don't call ready_for_review again for it: when it is done, the plugin posts the answer on HAL-1 and wakes you there\\.`,
        ),
      );
      expect(first.data).toEqual({ verdict: "running", checkId, wakeTask: "HAL-1" });
    });

    test("a second call for the same check gives the same answer without a request", async () => {
      const { call, sent, first } = await keptCheck();
      for (const params of [{ branch, sha }, { branch }, { checkId }]) {
        expect(await call(params)).toEqual(first);
      }
      expect(sent).toEqual([]);
    });

    test("a passed check is posted on the task and wakes it once", async () => {
      const { pass, answer, comments, wakes, sent } = await keptCheck();
      answer(passed);
      await pass();
      expect(sent).toEqual([{ method: "GET", url: checkUrl }]);
      expect(comments).toHaveLength(1);
      expect(comments[0]?.taskId).toBe("task-1");
      expect(comments[0]?.body).toMatch(
        new RegExp(
          `^ready_for_review on \`${branch}\`, check ${checkId}:\\n\\nPASS: all checks passed`,
        ),
      );
      expect(wakes).toEqual([{ taskId: "task-1", key: `ready-for-review ${checkId}` }]);

      await pass();
      expect(sent).toHaveLength(1);
      expect(comments).toHaveLength(1);
      expect(wakes).toHaveLength(1);
    });

    test("a failed check is posted with its failed steps and wakes the task once", async () => {
      const { pass, answer, comments, wakes, metrics } = await keptCheck();
      answer(failed);
      await pass();
      expect(comments[0]?.body).toContain("FAIL: format. Fix it, push");
      expect(comments[0]?.body).toContain("src/acme.ts: File content differs");
      expect(wakes).toHaveLength(1);
      expect(metrics.at(-1)).toEqual({
        name: "precheck.answers",
        value: 1,
        tags: { companyId: "acme", job: "precheck-wake", result: "fail", woken: "yes" },
      });
    });

    test("a check still running after 30 minutes is CHECK UNAVAILABLE and wakes the task once", async () => {
      const { pass, answer, advance, comments, wakes } = await keptCheck();
      answer(running);
      advance(waitTimeoutMs - 1);
      await pass();
      expect(comments).toEqual([]);

      answer(new TypeError("fetch failed"));
      advance(1);
      await pass();
      expect(comments[0]?.body).toContain(
        `CHECK UNAVAILABLE: check ${checkId} didn't finish within 30 minutes. Go on without it`,
      );
      expect(wakes).toEqual([{ taskId: "task-1", key: `ready-for-review ${checkId}` }]);
    });

    test("a running check or a service that's down keeps the check and wakes nobody", async () => {
      const { pass, answer, comments, wakes, call, sent } = await keptCheck();
      answer(running, new TypeError("fetch failed"), { status: 502 });
      for (let run = 0; run < 3; run += 1) {
        await pass();
      }
      expect(sent).toHaveLength(3);
      expect(comments).toEqual([]);
      expect(wakes).toEqual([]);
      expect((await call({ checkId })).data).toMatchObject({ wakeTask: "HAL-1" });
    });

    test("a check the service no longer knows is posted as CHECK UNAVAILABLE", async () => {
      const { pass, answer, comments, wakes } = await keptCheck();
      answer({ status: 404 });
      await pass();
      expect(comments[0]?.body).toContain(`CHECK UNAVAILABLE: check ${checkId} is unknown`);
      expect(wakes).toHaveLength(1);
    });

    test("posts but wakes nobody when another agent holds the task by then", async () => {
      const { pass, answer, comments, wakes, tasks } = await keptCheck();
      const task = tasks[0];
      if (task !== undefined) task.assigneeAgentId = "agent-liam";
      answer(passed);
      await pass();
      expect(comments).toHaveLength(1);
      expect(wakes).toEqual([]);
    });

    test("a new check of the same branch replaces the kept one", async () => {
      const { call, answer, pass, comments, sent } = await keptCheck();
      const newer = "9d8e7f6a5b4c";
      const newerSha = "b".repeat(40);
      answer(
        { status: 202, body: { id: newer, status: "queued" } },
        { status: 200, body: { id: newer, status: "running" } },
        { status: 200, body: { id: newer, status: "running" } },
      );
      expect((await call({ branch, sha: newerSha })).data).toMatchObject({ checkId: newer });
      sent.length = 0;
      answer({ status: 200, body: { ...passed.body, id: newer } });
      await pass();
      expect(sent).toEqual([{ method: "GET", url: `http://halonic-precheck:8787/check/${newer}` }]);
      expect(comments).toHaveLength(1);
    });

    test("a branch without a task the agent holds keeps the RUNNING answer with the id", async () => {
      const cases = [
        { branch: "acme-widget", tasks: [heldTask] },
        { branch, tasks: [] },
        { branch, tasks: [{ ...heldTask, assigneeAgentId: "agent-liam" }] },
      ];
      for (const one of cases) {
        const fake = fakePrecheck([queued, running, running], { tasks: one.tasks });
        const result = await fake.call({ branch: one.branch, sha });
        expect(result.data).toEqual({ verdict: "running", checkId });
        expect(result.content).toContain(`Call ready_for_review again with checkId "${checkId}"`);
        await fake.pass();
        expect(fake.comments).toEqual([]);
      }
    });

    test("a failure to keep the check costs the wake, never the answer", async () => {
      const broken = fakePrecheck([queued, running, running], { tasks: [heldTask] });
      // The task lookup throws, as a host refusal would.
      broken.tasks.find = () => {
        throw new Error("host refused");
      };
      const result = await broken.call({ branch });
      expect(result.data).toEqual({ verdict: "running", checkId });
      expect(broken.logs).toEqual([
        `ready_for_review: couldn't remember check ${checkId}: host refused`,
      ]);
    });

    test("reads the task from the branch name", () => {
      expect(taskOfBranch("mateo/HAL-16437-ready-for-review")).toBe("HAL-16437");
      expect(taskOfBranch("ravi/HAL-1-x")).toBe("HAL-1");
      expect(taskOfBranch("HAL-1-x")).toBeUndefined();
      expect(taskOfBranch("ravi/fix-HAL-1")).toBeUndefined();
    });
  });
});
