import { toolActionInfo, toolActionNames } from "@halonicjs/format";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, test } from "vitest";
import { pluginActions } from "./actions.ts";
import { builtIn, fakeHost } from "./fake-host.test-helper.ts";
import type { ActionCall, ActionHandlers } from "./handlers.ts";
import { writeCapabilities } from "./host.ts";
import { paperclipAccess } from "./paperclip-access.ts";
import { fakePaperclip } from "./paperclip-writes.test-helper.ts";
import { registerWorkspaceTools } from "./register.ts";

const call = { companyId: "acme", runId: "run-1" };

/** A fake host whose agent list records what reaches it. */
function recordingAgentList() {
  const { host } = fakePaperclip();
  const asked: unknown[] = [];
  const list = async (input: unknown) => {
    asked.push(input);
    return [];
  };
  return { recording: { ...host, agents: { ...host.agents, list } }, asked };
}

verifies("runtime.paperclip-writes", () => {
  describe("a call's Paperclip access", () => {
    test("refuses the write clients to an action that didn't declare them, before the host", async () => {
      const { host, received } = fakePaperclip();
      const access = paperclipAccess(host, ["issues.read"], call);
      expect(() => access.issues.createComment("task-16403", "Hi.", "acme")).toThrow(
        "this action doesn't declare issue.comments.create, so it may not use it.",
      );
      expect(() => access.issues.update("task-16403", { status: "done" }, "acme")).toThrow(
        "this action doesn't declare issues.update, so it may not use it.",
      );
      expect(access.issues.setDisposition).toBeUndefined();
      expect(received).toEqual([]);
      expect(await access.issues.get("HAL-16403", "acme")).toMatchObject({ id: "task-16403" });
    });

    test("lists agents only for an action that declared agents.read, before the host", async () => {
      const { recording, asked } = recordingAgentList();
      const access = paperclipAccess(recording, ["issues.read", "issues.update"], call);
      expect(() => access.agents.list({ companyId: "acme" })).toThrow(
        "this action doesn't declare agents.read, so it may not use it.",
      );
      expect(asked).toEqual([]);
      await paperclipAccess(recording, ["agents.read"], call).agents.list({ companyId: "acme" });
      expect(asked).toEqual([{ companyId: "acme" }]);
    });

    test("lists projects only for an action that declared projects.read, before the host", async () => {
      const { host } = fakePaperclip();
      const asked: unknown[] = [];
      const recording = {
        ...host,
        projects: {
          list: async (input: unknown) => {
            asked.push(input);
            return [];
          },
        },
      };
      const noProjects = paperclipAccess(recording, ["agents.read"], call);
      expect(() => noProjects.projects.list({ companyId: "acme" })).toThrow(
        "this action doesn't declare projects.read, so it may not use it.",
      );
      expect(asked).toEqual([]);
      await paperclipAccess(recording, ["projects.read"], call).projects.list({
        companyId: "globex",
        limit: 5,
      });
      expect(asked).toEqual([{ companyId: "acme", limit: 5 }]);
    });

    test("lists approvals only for an action that declared approvals.read, before the host", async () => {
      const { host } = fakePaperclip();
      const asked: unknown[] = [];
      const recording = {
        ...host,
        approvals: {
          list: async (input: unknown) => {
            asked.push(input);
            return [];
          },
        },
      };
      const noApprovals = paperclipAccess(recording, ["projects.read"], call);
      expect(() => noApprovals.approvals.list({ companyId: "acme" })).toThrow(
        "this action doesn't declare approvals.read, so it may not use it.",
      );
      expect(asked).toEqual([]);
      await paperclipAccess(recording, ["approvals.read"], call).approvals.list({
        companyId: "globex",
        status: "pending",
      });
      expect(asked).toEqual([{ companyId: "acme", status: "pending" }]);
    });

    test("lists the call's company's agents, whatever company the action asks for", async () => {
      const { recording, asked } = recordingAgentList();
      const access = paperclipAccess(recording, ["agents.read"], call);
      await access.agents.list({ companyId: "globex", limit: 5 });
      expect(asked).toEqual([{ companyId: "acme", limit: 5 }]);
    });

    test("reads the call's company's state, whatever company the action asks for", async () => {
      const keys: unknown[] = [];
      const host = {
        ...fakePaperclip().host,
        state: {
          get: async (key: unknown) => {
            keys.push(key);
            return null;
          },
        },
      };
      const access = paperclipAccess(host, [], call);
      await access.state.get({
        scopeKind: "company",
        scopeId: "globex",
        namespace: "runs",
        stateKey: "failed-runs",
      });
      expect(keys).toEqual([
        { scopeKind: "company", scopeId: "acme", namespace: "runs", stateKey: "failed-runs" },
      ]);
    });

    test("gives setDisposition only to an action that may update, on a host that has it", () => {
      const mayUpdate = paperclipAccess(fakePaperclip().host, ["issues.update"], call);
      expect(mayUpdate.issues.setDisposition).toBeTypeOf("function");
      const plain = paperclipAccess(
        fakePaperclip({ disposition: false }).host,
        ["issues.update"],
        call,
      );
      expect(plain.issues.setDisposition).toBeUndefined();
    });

    test("a read action served by the runtime can't reach a write client", async () => {
      const handlers: ActionHandlers = {
        "github.pull-request": {
          capabilities: [],
          run: async (one: ActionCall) => {
            await one.paperclip.issues.createComment("task-1", "Sneaky.", "acme");
            return { content: "wrote" };
          },
        },
      };
      const host = fakeHost({}, {});
      const declarations = [
        { name: "pr_status", displayName: "pr_status", description: "", parametersSchema: {} },
      ];
      registerWorkspaceTools(host.ctx, { declarations, builtIn, handlers });
      expect(await host.call("pr_status", {})).toEqual({
        error:
          "pr_status: this action doesn't declare issue.comments.create, so it may not use it.",
      });
      expect(host.writes).toEqual([]);
    });
  });

  test("only the actions the format marks as writing get a write capability", () => {
    for (const action of pluginActions()) {
      const writes = action.capabilities.some((one) => writeCapabilities.includes(one));
      expect([action.name, writes]).toEqual([action.name, toolActionInfo(action.name).writes]);
    }
    const available = pluginActions()
      .filter((action) => action.available)
      .map((action) => action.name);
    expect(available).toEqual(
      expect.arrayContaining(toolActionNames().filter((name) => toolActionInfo(name).writes)),
    );
  });
});
