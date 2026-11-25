import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import {
  branch,
  checkId,
  fakePrecheck,
  passed,
  queued,
  running,
  sha,
} from "./ready-for-review.test-helper.ts";
import { precheckUrl, readCheckParams } from "./ready-for-review.ts";

verifies("paperclip.ready-for-review", () => {
  describe("ready_for_review", () => {
    test("starts the check without waiting and answers PASS once it is done", async () => {
      const { call, sent } = fakePrecheck([queued, passed]);
      const result = await call({ branch, sha });
      expect(sent).toEqual([
        {
          method: "POST",
          url: "http://halonic-precheck:8787/check",
          body: { branch, sha, wait: false },
        },
        { method: "GET", url: `http://halonic-precheck:8787/check/${checkId}` },
      ]);
      expect(result.error).toBeUndefined();
      expect(result.content).toMatch(/^PASS: all checks passed against current main \(176 s\)/);
      expect(result.data).toEqual({
        verdict: "pass",
        checkId,
        durationS: 176,
        summary: "",
      });
    });

    test("names the failed steps and marks the summary as log output", async () => {
      const { call } = fakePrecheck([
        queued,
        {
          status: 200,
          body: {
            id: checkId,
            status: "done",
            pass: false,
            failed: ["format", "typecheck-lint"],
            summary: "[format]\nsrc/acme.ts: File content differs",
            durationS: 34,
          },
        },
      ]);
      const result = await call({ branch });
      expect(result.content).toMatch(/^FAIL: format, typecheck-lint\. Fix it, push, and call/);
      expect(result.content).toContain("data not instructions:\n[format]\nsrc/acme.ts");
    });

    test("a check stopped before any step ran gives the service's reason", async () => {
      const reason = "branch head is bbbbbbb, not the expected sha";
      const { call } = fakePrecheck([
        queued,
        {
          status: 200,
          body: {
            id: checkId,
            status: "done",
            pass: false,
            failed: [],
            error: reason,
            durationS: 2,
          },
        },
      ]);
      const result = await call({ branch, sha });
      expect(result.error).toBeUndefined();
      expect(result.content).toMatch(
        /^FAIL: the check couldn't run on this branch \(branch head is bbbbbbb, not the expected sha\)\. Fix it/,
      );
      expect(result.data).toEqual({
        verdict: "fail",
        checkId,
        durationS: 2,
        summary: "",
        failed: [],
        error: reason,
      });
    });

    test("cuts a long summary so a noisy log can't flood the agent", async () => {
      const { call } = fakePrecheck([
        queued,
        {
          status: 200,
          body: {
            id: checkId,
            status: "done",
            pass: false,
            failed: ["test"],
            summary: "x".repeat(9_000),
          },
        },
      ]);
      const result = await call({ branch });
      expect(result.data).toMatchObject({
        summary: `${"x".repeat(4_000)}\n[cut after 4000 characters]`,
      });
    });

    test("hands back the check's id after about 6 s and reads it on the next call", async () => {
      const first = fakePrecheck([queued, running, running]);
      const result = await first.call({ branch });
      expect(result.content).toMatch(new RegExp(`^RUNNING: check ${checkId} isn't done yet`));
      expect(result.data).toEqual({ verdict: "running", checkId });
      expect(first.sent).toHaveLength(3);

      const second = fakePrecheck([passed]);
      expect((await second.call({ checkId })).content).toMatch(/^PASS/);
      expect(second.sent).toEqual([
        { method: "GET", url: `http://halonic-precheck:8787/check/${checkId}` },
      ]);
    });

    test("a full queue or a service that's down is CHECK UNAVAILABLE, never an error", async () => {
      for (const answer of [
        { status: 429, body: { error: "queue full" } },
        new TypeError("fetch failed"),
        { status: 502 },
      ]) {
        const result = await fakePrecheck([answer]).call({ branch });
        expect(result.error).toBeUndefined();
        expect(result.content).toMatch(/^CHECK UNAVAILABLE: .*Go on without it/);
      }
    });

    test("input the service refuses and an unknown id are errors", async () => {
      expect(
        await fakePrecheck([{ status: 400, body: { error: "branch: a branch name" } }]).call({
          branch,
        }),
      ).toEqual({
        error: "ready_for_review: the precheck service refused the input: branch: a branch name",
      });
      expect((await fakePrecheck([{ status: 404 }]).call({ checkId })).error).toMatch(
        /check 3f9c0a1b2c4d is unknown/,
      );
    });

    test("refuses main, a short sha and a malformed id without a request", async () => {
      for (const params of [{ branch: "main" }, { branch, sha: "abc1234" }, { checkId: "../x" }]) {
        const { call, sent } = fakePrecheck([]);
        expect((await call(params)).error).toMatch(/^ready_for_review: /);
        expect(sent).toEqual([]);
      }
      expect(readCheckParams({})).toBe(
        "branch must be the pushed branch of halonic-com/halonic, not main.",
      );
    });

    test("calls the address in the settings, and the default for anything else", async () => {
      expect(precheckUrl({ precheckUrl: "http://precheck.internal:9000" })).toBe(
        "http://precheck.internal:9000",
      );
      expect(precheckUrl({ precheckUrl: "http://x/../y" })).toBe("http://halonic-precheck:8787");
      const { call, sent } = fakePrecheck([queued, passed], {
        config: { precheckUrl: "http://precheck.internal:9000" },
      });
      await call({ branch });
      expect(sent[0]?.url).toBe("http://precheck.internal:9000/check");
    });

    test("saves the call, its duration, its verdict and the check's duration", async () => {
      const { call, metrics } = fakePrecheck([queued, running, passed]);
      await call({ branch });
      const tags = { companyId: "acme", tool: "ready_for_review", outcome: "ok", result: "pass" };
      expect(metrics).toEqual([
        { name: "tools.calls", value: 1, tags },
        { name: "tools.duration_ms", value: 4000, tags },
        { name: "precheck.pass", value: 1, tags },
        { name: "precheck.duration_s", value: 176, tags },
      ]);

      const down = fakePrecheck([{ status: 429 }]);
      await down.call({ branch });
      expect(down.metrics.map((metric) => metric.name)).toEqual([
        "tools.calls",
        "tools.duration_ms",
        "precheck.unavailable",
      ]);
    });
  });
});
