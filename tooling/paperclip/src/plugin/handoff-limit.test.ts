import { verifies } from "@halonicjs/testing-spec";
import type { PluginEvent } from "@paperclipai/plugin-sdk";
import { describe, expect, test } from "vitest";
import { fakeMetrics, fakeState } from "./fake-host.test-helper.ts";
import { type HandoffLimitApi, handoffLimit } from "./handoff-limit.ts";

/** Who changed the task, as the event says. */
type Actor = NonNullable<PluginEvent["actorType"]>;

interface FakeTask {
  id: string;
  identifier: string;
  companyId: string;
  parentId: string | null;
  assigneeAgentId: string | null;
  labels: { name: string }[];
  createdByUserId: string | null;
  createdByAgentId: string | null;
}

/** Who made the parent task: the board through the provider, or an agent. */
type Maker = { createdByUserId: string | null; createdByAgentId: string | null };

const byBoard: Maker = { createdByUserId: "user-board", createdByAgentId: null };

/** A channel's parent task and one child task under it, assigned to Chief. */
function channelTasks(parentLabels = ["Channel"], parentMaker: Maker = byBoard): FakeTask[] {
  return [
    {
      id: "channel-1",
      identifier: "HAL-1",
      companyId: "acme",
      parentId: null,
      assigneeAgentId: null,
      labels: parentLabels.map((name) => ({ name })),
      ...parentMaker,
    },
    {
      id: "child-1",
      identifier: "HAL-2",
      companyId: "acme",
      parentId: "channel-1",
      assigneeAgentId: "agent-chief",
      labels: [],
      createdByUserId: null,
      createdByAgentId: "agent-chief",
    },
  ];
}

/** The handler on a fake host that applies each update to the task, as Paperclip does. */
function harness(tasks: FakeTask[]) {
  const { metrics, written } = fakeMetrics();
  const { state } = fakeState();
  const comments: { issueId: string; body: string }[] = [];
  const logs: string[] = [];
  const hooks: { afterGet?: (() => void) | undefined } = {};
  const ctx = {
    issues: {
      get: async (id: string) => {
        const found = tasks.find((task) => task.id === id);
        hooks.afterGet?.();
        return found === undefined ? null : structuredClone(found);
      },
      update: async (id: string, patch: { assigneeAgentId: string }) => {
        const task = tasks.find((each) => each.id === id);
        if (task !== undefined) {
          task.assigneeAgentId = patch.assigneeAgentId;
        }
        return task;
      },
      createComment: async (issueId: string, body: string) => {
        comments.push({ issueId, body });
        return {};
      },
    },
    logger: { info: (line: string) => logs.push(line), error: (line: string) => logs.push(line) },
    metrics,
    state,
  } as unknown as HandoffLimitApi;
  const handler = handoffLimit(ctx);
  const child = () => tasks[1] as FakeTask;
  const event = (
    eventType: "issue.created" | "issue.updated",
    actorType: Actor,
    payload: Record<string, unknown> = {},
  ): PluginEvent => ({
    eventId: `event-${Math.random()}`,
    eventType,
    occurredAt: "2026-11-24T12:00:00Z",
    actorType,
    entityId: "child-1",
    entityType: "issue",
    companyId: "acme",
    payload,
  });
  /** Someone assigns the child task to `agent`, and the plugin handles the event. */
  const pass = async (agent: string, actorType: Actor = "agent") => {
    child().assigneeAgentId = agent;
    await handler.onIssueEvent(event("issue.updated", actorType));
  };
  /** The plugin handles the `issue.updated` its own assign-back caused. */
  const echo = () => handler.onIssueEvent(event("issue.updated", "plugin"));
  return { handler, event, pass, echo, child, comments, logs, written, hooks };
}

verifies("paperclip.handoff-limit", () => {
  describe("the hand-off limit on a channel's child task", () => {
    test("lets three agent hand-offs through and assigns the fourth back", async () => {
      const host = harness(channelTasks());
      await host.handler.onIssueEvent(host.event("issue.created", "user"));
      for (const agent of ["agent-liam", "agent-julian", "agent-mateo"]) {
        await host.pass(agent);
      }
      expect(host.child().assigneeAgentId).toBe("agent-mateo");
      expect(host.comments).toEqual([]);
      await host.pass("agent-elena");
      await host.echo();
      expect(host.child().assigneeAgentId).toBe("agent-mateo");
      expect(host.comments).toEqual([{ issueId: "child-1", body: "Stopped after 3 hand-offs" }]);
      expect(host.logs).toEqual(["Hand-off limit: assigned HAL-2 back after 3 hand-offs."]);
      expect(host.written.map((metric) => metric.name)).toEqual(["handoff_limit.reverted"]);
    });

    test("never counts the board's reassignments", async () => {
      const host = harness(channelTasks());
      await host.handler.onIssueEvent(host.event("issue.created", "user"));
      await host.pass("agent-liam");
      await host.pass("agent-julian", "user");
      await host.pass("agent-mateo");
      await host.pass("agent-chief", "user");
      await host.pass("agent-elena");
      expect(host.child().assigneeAgentId).toBe("agent-elena");
      await host.pass("agent-noah", "user");
      expect(host.child().assigneeAgentId).toBe("agent-noah");
      expect(host.comments).toEqual([]);
    });

    test("counts two quick hand-offs from the events' payloads", async () => {
      const host = harness(channelTasks());
      await host.handler.onIssueEvent(host.event("issue.created", "user"));
      await host.pass("agent-liam");
      await host.pass("agent-julian");
      host.child().assigneeAgentId = "agent-elena";
      await Promise.all([
        host.handler.onIssueEvent(
          host.event("issue.updated", "agent", { assigneeAgentId: "agent-mateo" }),
        ),
        host.handler.onIssueEvent(
          host.event("issue.updated", "agent", { assigneeAgentId: "agent-elena" }),
        ),
      ]);
      expect(host.child().assigneeAgentId).toBe("agent-mateo");
      expect(host.comments).toHaveLength(1);
    });

    test("leaves the task alone when its assignee changes before it is assigned back", async () => {
      const host = harness(channelTasks());
      await host.handler.onIssueEvent(host.event("issue.created", "user"));
      for (const agent of ["agent-liam", "agent-julian", "agent-mateo"]) {
        await host.pass(agent);
      }
      // The board moves the task to Noah right after the agent's move to Elena, which the event carries.
      host.hooks.afterGet = () => {
        host.child().assigneeAgentId = "agent-noah";
      };
      const toElena = { assigneeAgentId: "agent-elena" };
      await host.handler.onIssueEvent(host.event("issue.updated", "agent", toElena));
      expect(host.child().assigneeAgentId).toBe("agent-noah");
      expect(host.comments).toEqual([]);
    });

    test("doesn't count a hand-off to or from no agent", async () => {
      const host = harness(channelTasks());
      await host.handler.onIssueEvent(host.event("issue.created", "user"));
      for (const agent of ["agent-liam", "agent-julian", "agent-mateo"]) {
        await host.pass(agent);
      }
      host.child().assigneeAgentId = null;
      await host.handler.onIssueEvent(host.event("issue.updated", "agent"));
      await host.pass("agent-elena");
      expect(host.child().assigneeAgentId).toBe("agent-elena");
      expect(host.comments).toEqual([]);
    });

    test("leaves a task alone whose parent isn't a channel", async () => {
      const host = harness(channelTasks(["D2"]));
      await host.handler.onIssueEvent(host.event("issue.created", "user"));
      for (const agent of ["agent-liam", "agent-julian", "agent-mateo", "agent-elena"]) {
        await host.pass(agent);
      }
      expect(host.child().assigneeAgentId).toBe("agent-elena");
      expect(host.comments).toEqual([]);
    });

    test.each([
      ["an agent", { createdByUserId: null, createdByAgentId: "agent-ravi" }],
      [
        "an agent on a person's behalf",
        { createdByUserId: "user-board", createdByAgentId: "agent-ravi" },
      ],
      ["nobody it names", { createdByUserId: null, createdByAgentId: null }],
    ])("leaves a task alone whose tagged parent was made by %s", async (_maker, parentMaker) => {
      const host = harness(channelTasks(["Channel"], parentMaker));
      await host.handler.onIssueEvent(host.event("issue.created", "user"));
      for (const agent of ["agent-liam", "agent-julian", "agent-mateo", "agent-elena"]) {
        await host.pass(agent);
      }
      expect(host.child().assigneeAgentId).toBe("agent-elena");
      expect(host.comments).toEqual([]);
      expect(host.written).toEqual([]);
    });
  });
});
