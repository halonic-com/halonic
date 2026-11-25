import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { agentAda, agentBo, company, plainTask, testKey } from "./acme-data.test-helper.ts";
import { FakePaperclip, type Network } from "./fake-paperclip.test-helper.ts";
import { PaperclipIds } from "./ids.ts";
import { buildPath, findRequest, paperclipRequests, UnsafeIdError } from "./requests.ts";
import { PaperclipRunControl, runAgainComment } from "./run-control.ts";

const runId = "e0000000-0000-4000-8000-000000000001";
const runPath = `/api/heartbeat-runs/${runId}`;
const taskPath = `/api/issues/${plainTask}`;
const ids = new PaperclipIds("acme");
const run = ids.make("run", runId);

/** Ada's run on ACME-7, as `getRun` answers it, with text the provider must never return. */
const adaRun = {
  id: runId,
  companyId: company,
  agentId: agentAda,
  issueId: plainTask,
  status: "running",
  error: "made-up error",
  execution: { canStop: true },
};

const openTask = {
  id: plainTask,
  companyId: company,
  identifier: "ACME-7",
  status: "in_progress",
  assigneeAgentId: agentAda,
};

let paperclip: FakePaperclip;
const network: Network = { offline: false };

/** Serves `getRun` with `runAnswer` and `getTask` with `taskAnswer`, and accepts both writes. */
function serve(runAnswer: object, taskAnswer: object = openTask): void {
  paperclip
    .on("GET", runPath, { body: runAnswer })
    .on("GET", taskPath, { body: taskAnswer })
    .on("GET", `/api/companies/${company}/agents`, {
      body: [
        { id: agentAda, name: "Ada" },
        { id: agentBo, name: "Bo" },
      ],
    })
    .on("POST", `${runPath}/cancel`, { body: { id: runId, status: "cancelled" } })
    .on("PATCH", taskPath, ({ body }) => ({ body: { ...openTask, ...(body as object) } }));
}

beforeEach(() => {
  network.offline = false;
  paperclip = new FakePaperclip();
});

const control = () =>
  new PaperclipRunControl({
    address: paperclip.address,
    key: testKey,
    connection: "acme",
    company,
    fetch: (input, init) =>
      network.offline
        ? Promise.reject(new TypeError("fetch failed"))
        : paperclip.fetch(input, init),
  });

/** The writes the fake saw. */
const writes = () => paperclip.seen.filter((request) => request.method !== "GET");

verifies("paperclip-client.team-run-control", () => {
  describe("the run control rows", () => {
    it("are one run read and its cancel, with no body, for a UUID only", () => {
      expect({
        getRun: paperclipRequests.getRun,
        cancelRun: paperclipRequests.cancelRun,
      }).toEqual({
        getRun: { method: "GET", path: "/api/heartbeat-runs/:run" },
        cancelRun: { method: "POST", path: "/api/heartbeat-runs/:run/cancel" },
      });
      expect(findRequest("POST", `${runPath}/cancel`)).toBe("cancelRun");
      expect(findRequest("GET", `${runPath}/log`)).toBeUndefined();
      expect(() => buildPath("cancelRun", { run: "r1" })).toThrow(UnsafeIdError);
    });
  });

  describe("stop", () => {
    it("cancels a run Paperclip can stop now", async () => {
      serve(adaRun);
      await expect(control().stop(run)).resolves.toEqual({ outcome: "stopping" });
      expect(writes().map((request) => `${request.method} ${request.path}`)).toEqual([
        `POST ${runPath}/cancel`,
      ]);
      expect(writes()[0]?.body).toBeUndefined();
    });

    it("sends no cancel when the run can't stop any more", async () => {
      serve({ ...adaRun, status: "running", execution: { canStop: false } });
      await expect(control().stop(run)).resolves.toEqual({
        outcome: "refused",
        reason: "not-stoppable",
      });
      serve({ ...adaRun, status: "failed" });
      await expect(control().stop(run)).resolves.toEqual({
        outcome: "refused",
        reason: "not-stoppable",
      });
      expect(writes()).toEqual([]);
    });

    it("refuses a run that ended between the read and the cancel as not stoppable", async () => {
      serve(adaRun);
      paperclip.on("POST", `${runPath}/cancel`, { status: 400, body: { error: "made-up error" } });
      await expect(control().stop(run)).resolves.toEqual({
        outcome: "refused",
        reason: "not-stoppable",
      });
    });

    it("finds no run of another company or connection, and sends nothing", async () => {
      serve({ ...adaRun, companyId: "c-other" });
      await expect(control().stop(run)).resolves.toMatchObject({ reason: "not-found" });
      const other = new PaperclipIds("other").make("run", runId);
      await expect(control().stop(other)).resolves.toMatchObject({ reason: "not-found" });
      expect(writes()).toEqual([]);
    });

    it("says unreachable when Paperclip can't be reached", async () => {
      serve(adaRun);
      network.offline = true;
      await expect(control().stop(run)).resolves.toEqual({
        outcome: "refused",
        reason: "unreachable",
      });
    });
  });

  describe("run again", () => {
    it("wakes the run's agent on the same task", async () => {
      serve({ ...adaRun, status: "failed" });
      await expect(control().runAgainCheck(run)).resolves.toEqual({ offered: true });
      await expect(control().runAgain(run)).resolves.toEqual({ outcome: "woken" });
      expect(writes().map((request) => [request.path, request.body])).toEqual([
        [taskPath, { assigneeAgentId: agentAda, status: "todo", comment: runAgainComment }],
      ]);
    });

    it("checks again on the write: a task done since the check gets no wake", async () => {
      serve({ ...adaRun, status: "failed" });
      await expect(control().runAgainCheck(run)).resolves.toEqual({ offered: true });
      serve({ ...adaRun, status: "failed" }, { ...openTask, status: "done" });
      await expect(control().runAgain(run)).resolves.toEqual({
        outcome: "refused",
        reason: "task-done",
      });
      expect(writes()).toEqual([]);
    });

    it("names the agent holding a moved task by display name, and a person not at all", async () => {
      serve(adaRun, { ...openTask, assigneeAgentId: agentBo });
      await expect(control().runAgainCheck(run)).resolves.toEqual({
        offered: false,
        why: "reassigned",
        task: "ACME-7",
        holder: "Bo",
      });
      serve(adaRun, { ...openTask, assigneeAgentId: null, assigneeUserId: "u-made-up" });
      await expect(control().runAgainCheck(run)).resolves.toEqual({
        offered: false,
        why: "reassigned",
        task: "ACME-7",
      });
      expect(writes()).toEqual([]);
    });

    it("isn't offered for a run without a task or a task of another company", async () => {
      serve({ ...adaRun, issueId: undefined });
      await expect(control().runAgainCheck(run)).resolves.toEqual({
        offered: false,
        why: "no-task",
      });
      serve(adaRun, { ...openTask, companyId: "c-other" });
      await expect(control().runAgain(run)).resolves.toEqual({
        outcome: "refused",
        reason: "not-found",
      });
      expect(writes()).toEqual([]);
    });

    it("never returns Paperclip's own text", async () => {
      serve(adaRun);
      paperclip.on("PATCH", taskPath, { status: 403, body: { error: "made-up error" } });
      const result = await control().runAgain(run);
      expect(result).toEqual({ outcome: "refused", reason: "not-allowed" });
      expect(JSON.stringify(result)).not.toContain("made-up");
    });
  });
});
