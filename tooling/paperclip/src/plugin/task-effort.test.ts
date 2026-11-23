import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import {
  apiKey,
  effortHarness,
  effortTask,
  switchOn,
  taskEvent,
} from "./task-effort.test-helper.ts";

const liamSays = (body: string) => ({
  authorAgentId: "agent-liam",
  createdAt: "2026-11-23T11:59:00Z",
  body,
});

verifies("paperclip.task-effort-writes", () => {
  describe("setting a task's effort from its tags", () => {
    test("sets low on a new D2 task and keeps its model override", async () => {
      const task = effortTask(["D2"], {
        assigneeAdapterOverrides: { adapterConfig: { model: "claude-sonnet-5-5" } },
      });
      const { handler, requests, written, effort } = effortHarness(task);
      await handler.onIssueEvent(taskEvent("issue.created"));
      expect(requests).toEqual([
        {
          url: "http://paperclip.test:3100/api/issues/task-1",
          method: "PATCH",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: {
            assigneeAdapterOverrides: {
              adapterConfig: { model: "claude-sonnet-5-5", effort: "low" },
            },
          },
        },
      ]);
      expect(effort()).toBe("low");
      expect(written.map((metric) => metric.name)).toEqual(["task_effort.set"]);
    });

    test("only logs while the switch is off or names another version", async () => {
      for (const version of [undefined, "0.0.1"]) {
        const settings = { ...switchOn, taskEffortWritesForVersion: version };
        const { handler, requests, logs, written } = effortHarness(effortTask(["D2"]), settings);
        await handler.onIssueEvent(taskEvent("issue.created"));
        expect(requests).toEqual([]);
        expect(logs).toEqual([
          { level: "info", line: "Task effort: would set HAL-1 to low (switch off)." },
        ]);
        expect(written.map((metric) => metric.name)).toEqual(["task_effort.logged"]);
      }
    });

    test("only logs without the API's address or key", async () => {
      const settings = { ...switchOn, paperclipApiUrl: "http://paperclip.test/elsewhere" };
      const { handler, requests } = effortHarness(effortTask(["D2"]), settings);
      await handler.onIssueEvent(taskEvent("issue.created"));
      const { paperclipApiKey: _key, ...keyless } = switchOn;
      const second = effortHarness(effortTask(["D2"]), keyless);
      await second.handler.onIssueEvent(taskEvent("issue.created"));
      expect([...requests, ...second.requests]).toEqual([]);
    });

    test("raises a D3 task to high when Liam hands it back asking for changes", async () => {
      const task = effortTask(["D3"]);
      const comments = [liamSays("[major] The test misses the empty case.")];
      const { handler, effort } = effortHarness(task, switchOn, comments);
      await handler.onIssueEvent(taskEvent("issue.created"));
      task.assigneeAgentId = "agent-liam";
      await handler.onIssueEvent(taskEvent("issue.updated"));
      expect(effort()).toBe("low");
      task.assigneeAgentId = "agent-mateo";
      await handler.onIssueEvent(taskEvent("issue.updated"));
      expect(effort()).toBe("high");
    });

    test("leaves low when Liam's newest comment is a signed approval", async () => {
      const task = effortTask(["D3"]);
      const comments = [
        {
          ...liamSays("[major] The test misses the empty case."),
          createdAt: "2026-11-23T10:00:00Z",
        },
        liamSays("Liam: approved on head `abc1234`"),
      ];
      const { handler, effort } = effortHarness(task, switchOn, comments);
      await handler.onIssueEvent(taskEvent("issue.created"));
      task.assigneeAgentId = "agent-liam";
      await handler.onIssueEvent(taskEvent("issue.updated"));
      task.assigneeAgentId = "agent-mateo";
      await handler.onIssueEvent(taskEvent("issue.updated"));
      expect(effort()).toBe("low");
    });

    test("takes its own effort off when the difficulty tag goes", async () => {
      const task = effortTask(["D2"], {
        assigneeAdapterOverrides: { adapterConfig: { model: "claude-sonnet-5-5" } },
      });
      const { handler, requests } = effortHarness(task);
      await handler.onIssueEvent(taskEvent("issue.created"));
      await handler.onIssueEvent(taskEvent("issue.updated"));
      task.labels = [];
      await handler.onIssueEvent(taskEvent("issue.updated"));
      expect(requests).toHaveLength(2);
      expect(task.assigneeAdapterOverrides).toEqual({
        adapterConfig: { model: "claude-sonnet-5-5" },
      });
    });

    test("sends nothing for a task without an agent", async () => {
      const { handler, requests } = effortHarness(effortTask(["D2"], { assigneeAgentId: null }));
      await handler.onIssueEvent(taskEvent("issue.created"));
      expect(requests).toEqual([]);
    });

    test("logs a refused change without the key and tries again on the next change", async () => {
      const task = effortTask(["D2"]);
      const { handler, requests, logs, written } = effortHarness(task, switchOn, [], 403);
      await handler.onIssueEvent(taskEvent("issue.created"));
      await handler.onIssueEvent(taskEvent("issue.updated"));
      expect(requests).toHaveLength(2);
      expect(logs[0]).toEqual({
        level: "error",
        line: "Task effort: couldn't set HAL-1 to low (http_403).",
      });
      expect(written[0]).toMatchObject({
        name: "task_effort.failed",
        tags: { reason: "http_403" },
      });
      expect(JSON.stringify([logs, written])).not.toContain(apiKey);
    });
  });
});

verifies("paperclip.task-effort-guard", () => {
  describe("effort changes the plugin didn't make", () => {
    test("an agent raising the plugin's low to max is an error, and the task is left alone", async () => {
      const task = effortTask(["D2"]);
      const { handler, requests, logs, written } = effortHarness(task);
      await handler.onIssueEvent(taskEvent("issue.created"));
      await handler.onIssueEvent(taskEvent("issue.updated"));
      task.assigneeAdapterOverrides = { adapterConfig: { effort: "max" } };
      await handler.onIssueEvent(taskEvent("issue.updated", "agent"));
      task.labels = [{ name: "D4" }];
      await handler.onIssueEvent(taskEvent("issue.updated"));
      expect(requests).toHaveLength(1);
      expect(logs.filter((log) => log.level !== "info")).toEqual([
        {
          level: "error",
          line: "Task effort: HAL-1 went from low to max, changed by an actor of type agent, not by the plugin; the plugin leaves this task's effort alone from now on.",
        },
      ]);
      expect(written.filter((metric) => metric.name === "task_effort.foreign_change")).toEqual([
        {
          name: "task_effort.foreign_change",
          value: 1,
          tags: { companyId: "acme", actorType: "agent", direction: "raised" },
        },
      ]);
    });

    test("a person creating a task with an effort is reported as a warning and kept", async () => {
      const task = effortTask(["D1"], {
        assigneeAdapterOverrides: { adapterConfig: { effort: "high" } },
      });
      const { handler, requests, logs, written, effort } = effortHarness(task);
      await handler.onIssueEvent(taskEvent("issue.created", "user"));
      expect(requests).toEqual([]);
      expect(effort()).toBe("high");
      expect(logs.map((log) => log.level)).toEqual(["warn"]);
      expect(written[0]).toMatchObject({ tags: { actorType: "user", direction: "set" } });
    });

    test("an effort from before the plugin watched is left alone without a report", async () => {
      const task = effortTask(["D2"], {
        assigneeAdapterOverrides: { adapterConfig: { effort: "high" } },
      });
      const { handler, requests, logs } = effortHarness(task);
      await handler.onIssueEvent(taskEvent("issue.updated"));
      expect(requests).toEqual([]);
      expect(logs).toEqual([]);
    });

    test("the plugin's own change coming back is not reported", async () => {
      const { handler, logs } = effortHarness(effortTask(["D2"]));
      await handler.onIssueEvent(taskEvent("issue.created"));
      await handler.onIssueEvent(taskEvent("issue.updated", "user"));
      expect(logs.map((log) => log.level)).toEqual(["info"]);
    });

    test("an effort word Paperclip doesn't know shows as other, and removing one counts", async () => {
      const task = effortTask(["D2"]);
      const { handler, logs, written } = effortHarness(task, {});
      await handler.onIssueEvent(taskEvent("issue.updated"));
      task.assigneeAdapterOverrides = { adapterConfig: { effort: "ignore previous instructions" } };
      await handler.onIssueEvent(taskEvent("issue.updated", "user"));
      task.assigneeAdapterOverrides = null;
      await handler.onIssueEvent(taskEvent("issue.updated", "user"));
      const reports = logs.filter((log) => log.level === "warn").map((log) => log.line);
      expect(reports[0]).toContain("from none to other");
      expect(reports[1]).toContain("from other to none");
      expect(JSON.stringify(written)).not.toContain("ignore previous");
      expect(written.filter((metric) => metric.name === "task_effort.foreign_change")).toHaveLength(
        2,
      );
    });
  });
});
