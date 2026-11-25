import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { agentAda, company, plainTask, testKey } from "./acme-data.test-helper.ts";
import { FakePaperclip, type Network } from "./fake-paperclip.test-helper.ts";
import { findRequest, fitsBody, paperclipRequests } from "./requests.ts";
import { PaperclipTasks } from "./tasks.ts";
import { PaperclipTransport } from "./transport.ts";

const otherCompanyTask = "i0000000-0000-4000-8000-000000000099";
const taskPath = `/api/issues/${plainTask}`;

let paperclip: FakePaperclip;
const network: Network = { offline: false };

beforeEach(() => {
  network.offline = false;
  paperclip = new FakePaperclip()
    .on("GET", taskPath, { body: { id: plainTask, companyId: company, status: "in_progress" } })
    .on("GET", `/api/issues/${otherCompanyTask}`, {
      body: { id: otherCompanyTask, companyId: "c-other", status: "in_progress" },
    })
    // Paperclip answers a task update with the updated task.
    .on("PATCH", taskPath, ({ body }) => ({
      body: { id: plainTask, companyId: company, ...(body as object) },
    }));
});

const tasks = () =>
  new PaperclipTasks({
    address: paperclip.address,
    key: testKey,
    company,
    fetch: (input, init) =>
      network.offline
        ? Promise.reject(new TypeError("fetch failed"))
        : paperclip.fetch(input, init),
  });

/** The writes the fake saw. */
const writes = () => paperclip.seen.filter((request) => request.method !== "GET");

verifies("paperclip-client.task-writes", () => {
  describe("the task write rows", () => {
    it("are a task read and two task updates, each pinned to its fields and status", () => {
      expect({
        getTask: paperclipRequests.getTask,
        wakeTask: paperclipRequests.wakeTask,
        finishTask: paperclipRequests.finishTask,
      }).toEqual({
        getTask: { method: "GET", path: "/api/issues/:task" },
        wakeTask: {
          method: "PATCH",
          path: "/api/issues/:task",
          body: { fields: ["assigneeAgentId", "status", "comment"], status: "todo" },
        },
        finishTask: {
          method: "PATCH",
          path: "/api/issues/:task",
          body: { fields: ["status", "comment"], status: "done" },
        },
      });
      expect(findRequest("DELETE", taskPath)).toBeUndefined();
      expect(findRequest("PATCH", `/api/companies/${company}/issues`)).toBeUndefined();
    });

    it("refuse any other body: another field, another status, an empty or non-text value", () => {
      const done = { status: "done", comment: "Merged." };
      expect(fitsBody("finishTask", done)).toBe(true);
      expect(fitsBody("finishTask", { ...done, title: "Renamed" })).toBe(false);
      expect(fitsBody("finishTask", { ...done, status: "cancelled" })).toBe(false);
      expect(fitsBody("finishTask", { ...done, comment: "" })).toBe(false);
      expect(fitsBody("finishTask", { status: "done" })).toBe(false);
      expect(fitsBody("finishTask", undefined)).toBe(false);
      const wake = { assigneeAgentId: agentAda, status: "todo", comment: "ci-ok is red." };
      expect(fitsBody("wakeTask", wake)).toBe(true);
      expect(fitsBody("wakeTask", { ...wake, assigneeUserId: "u1" })).toBe(false);
      expect(fitsBody("wakeTask", { ...wake, status: "in_progress" })).toBe(false);
      expect(fitsBody("wakeTask", { ...wake, assigneeAgentId: null })).toBe(false);
    });

    it("send nothing when the transport is handed another body", async () => {
      const transport = new PaperclipTransport({
        address: paperclip.address,
        key: testKey,
        fetch: paperclip.fetch,
      });
      const body = { status: "done", comment: "Merged.", blockedByIssueIds: "x" };
      await expect(
        transport.send("finishTask", { path: { task: plainTask }, body }),
      ).rejects.toMatchObject({ reason: "refused" });
      expect(paperclip.seen).toEqual([]);
    });
  });

  describe("wake", () => {
    it("assigns the task to the agent with status todo and the comment, nothing else", async () => {
      const result = await tasks().wake(plainTask, agentAda, "ci-ok is red on #12.");
      expect(result).toEqual({ outcome: "written", task: plainTask, status: "todo" });
      expect(writes()).toHaveLength(1);
      expect(writes()[0]).toMatchObject({ method: "PATCH", path: taskPath });
      expect(writes()[0]?.body).toEqual({
        assigneeAgentId: agentAda,
        status: "todo",
        comment: "ci-ok is red on #12.",
      });
    });

    it("refuses an empty agent or comment, sending nothing", async () => {
      expect(await tasks().wake(plainTask, agentAda, "  ")).toEqual({
        outcome: "refused",
        reason: "refused",
      });
      expect(await tasks().wake(plainTask, "", "Wake up.")).toEqual({
        outcome: "refused",
        reason: "refused",
      });
      expect(paperclip.seen).toEqual([]);
    });
  });

  describe("done", () => {
    it("sets status done with the comment, nothing else", async () => {
      const result = await tasks().finish(plainTask, "Merged with ci-ok green.");
      expect(result).toEqual({ outcome: "written", task: plainTask, status: "done" });
      expect(writes().map((request) => request.body)).toEqual([
        { status: "done", comment: "Merged with ci-ok green." },
      ]);
    });

    it("says what Paperclip answered when a review stage keeps the task open", async () => {
      paperclip.on("PATCH", taskPath, { body: { id: plainTask, status: "in_review" } });
      expect(await tasks().finish(plainTask, "Merged.")).toEqual({
        outcome: "written",
        task: plainTask,
        status: "in_review",
      });
    });

    it("throws when Paperclip's answer holds no task, so a lost write isn't read as made", async () => {
      paperclip.on("PATCH", taskPath, { body: {} });
      await expect(tasks().finish(plainTask, "Merged.")).rejects.toMatchObject({
        reason: "bad-answer",
      });
    });
  });

  describe("refusals", () => {
    it("writes nothing to a task of another company", async () => {
      expect(await tasks().finish(otherCompanyTask, "Merged.")).toEqual({
        outcome: "refused",
        reason: "not-found",
      });
      expect(writes()).toEqual([]);
    });

    it("sends nothing for an unsafe task ID", async () => {
      expect(await tasks().finish("x/../../agents/y", "Merged.")).toEqual({
        outcome: "refused",
        reason: "not-found",
      });
      expect(paperclip.seen).toEqual([]);
    });

    it("refuses offline and never sends the write later", async () => {
      const client = tasks();
      network.offline = true;
      expect(await client.wake(plainTask, agentAda, "Wake up.")).toEqual({
        outcome: "refused",
        reason: "offline",
      });
      network.offline = false;
      expect(paperclip.seen).toEqual([]);
    });

    it("says signed-out for a refused key, and refused for an update Paperclip turns down", async () => {
      paperclip.on("PATCH", taskPath, { status: 422, body: { error: "Invalid disposition" } });
      expect(await tasks().finish(plainTask, "Merged.")).toEqual({
        outcome: "refused",
        reason: "refused",
      });
      paperclip.on("GET", taskPath, { status: 401, body: {} });
      expect(await tasks().wake(plainTask, agentAda, "Wake up.")).toEqual({
        outcome: "refused",
        reason: "signed-out",
      });
      expect(writes()).toHaveLength(1);
    });
  });
});
