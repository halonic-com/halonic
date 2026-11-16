import type { WorkflowsHost } from "@halonicjs/studio-feature-workflows/api";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceRequests } from "./workspace-requests.ts";

const support = {
  hubId: "support",
  id: "support-reply",
  name: "Support reply",
  description: "A customer's email",
  request: { label: "Answer a customer's email", fields: [{ name: "mail" }] },
};
const triage = { hubId: "support", id: "triage", name: "Triage", request: undefined };

/** A workflows host that knows only what the requests read: the list, each one's settings, and the engine. */
function host(options: { engine?: boolean } = {}) {
  const startRun = vi.fn(async () => ({ runId: "r9" }));
  const listeners = new Set<() => void>();
  const workflows = [support, triage];
  const fake = {
    list: async () => workflows,
    configuration: async ({ hubId, id }: { hubId: string; id: string }) => {
      const found = workflows.find((one) => one.hubId === hubId && one.id === id);
      if (found === undefined) throw new Error("not there");
      return found;
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ...(options.engine === false ? {} : { startRun }),
  } as unknown as WorkflowsHost;
  return { fake, startRun, listeners };
}

verifies("studio.inbox-requests", () => {
  it("offers the workflows that have a start block, by label, with the description", async () => {
    const requests = new WorkspaceRequests(host().fake);
    expect(await requests.offered()).toEqual([
      {
        key: "support/support-reply",
        label: "Answer a customer's email",
        description: "A customer's email",
      },
    ]);
  });

  it("starts the workflow with the message as the start field's input", async () => {
    const { fake, startRun } = host();
    const run = await new WorkspaceRequests(fake).start("support/support-reply", "Hi, Sam here.");
    expect(startRun).toHaveBeenCalledWith(
      { hubId: "support", id: "support-reply" },
      { mail: "Hi, Sam here." },
    );
    expect(run).toEqual({ runId: "r9" });
  });

  it("refuses a workflow that isn't offered any more", async () => {
    const { fake, startRun } = host();
    await expect(new WorkspaceRequests(fake).start("support/triage", "Hello")).rejects.toThrow(
      "isn't offered as a request any more",
    );
    expect(startRun).not.toHaveBeenCalled();
  });

  describe("without an engine", () => {
    it("offers nothing and starts nothing", async () => {
      const requests = new WorkspaceRequests(host({ engine: false }).fake);
      expect(await requests.offered()).toEqual([]);
      await expect(requests.start("support/support-reply", "Hello")).rejects.toThrow("engine");
    });
  });

  describe("changes", () => {
    it("tells the Inbox when the workflows change, until it stops listening", () => {
      const { fake, listeners } = host();
      const heard = vi.fn();
      const stop = new WorkspaceRequests(fake).subscribe(heard);
      for (const listener of listeners) listener();
      expect(heard).toHaveBeenCalledTimes(1);
      stop();
      expect(listeners.size).toBe(0);
    });
  });
});
