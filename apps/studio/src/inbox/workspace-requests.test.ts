import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceRequests, type WorkspaceRequestsParts } from "./workspace-requests.ts";

const supportReply = [
  "id: support-reply",
  "name: Support reply",
  "description: A customer's email",
  "start:",
  "  label: Answer a customer's email",
  "  field: mail",
  "initial: first",
  "states:",
  "  first:",
  "    type: final",
  "",
].join("\n");
const triage = "id: triage\nname: Triage\ninitial: first\nstates:\n  first:\n    type: final\n";

/** The workspace's files and engine as the requests read them; `reads` counts every file read. */
function setup(options: { engine?: boolean } = {}) {
  const store: Record<string, string> = {
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    "hubs/support/workflows/support-reply.workflow.yaml": supportReply,
    "hubs/support/workflows/triage.workflow.yaml": triage,
  };
  const startRun = vi.fn(async () => ({ id: "r9" }));
  const listeners = new Set<() => void>();
  const read = vi.fn(async (path: string) => store[path] ?? null);
  const parts: WorkspaceRequestsParts = {
    files: {
      read,
      list: async (dir) =>
        Object.keys(store)
          .filter((path) => path.startsWith(`${dir}/`))
          .sort(),
    },
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    ...(options.engine === false ? {} : { engine: { startRun } }),
  };
  return { requests: new WorkspaceRequests(parts), store, startRun, listeners, read };
}

verifies("studio.inbox-requests", () => {
  it("offers the workflows that have a start block, by label, with the description", async () => {
    expect(await setup().requests.offered()).toEqual([
      {
        key: "support/support-reply",
        label: "Answer a customer's email",
        description: "A customer's email",
      },
    ]);
  });

  it("reads each file once for one offer, however many workflows there are", async () => {
    const { requests, read } = setup();
    await requests.offered();
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("starts the workflow with the message as the start field's input", async () => {
    const { requests, startRun } = setup();
    const run = await requests.start("support/support-reply", "Hi, Sam here.");
    expect(startRun).toHaveBeenCalledWith(
      { hubId: "support", workflowId: "support-reply" },
      { mail: "Hi, Sam here." },
    );
    expect(run).toEqual({ runId: "r9", hubId: "support" });
  });

  it("refuses a workflow that isn't offered any more, or a key it never offered", async () => {
    const { requests, startRun } = setup();
    for (const key of ["support/triage", "no-slash"]) {
      await expect(requests.start(key, "Hello")).rejects.toThrow(
        "isn't offered as a request any more",
      );
    }
    expect(startRun).not.toHaveBeenCalled();
  });

  it("offers what is in the files now, so an edit or a deleted workflow can't leave a stale list", async () => {
    const { requests, store } = setup();
    delete store["hubs/support/workflows/support-reply.workflow.yaml"];
    expect(await requests.offered()).toEqual([]);
  });

  it("still offers the other workflows when one workflow's file doesn't parse", async () => {
    const { requests, store } = setup();
    store["hubs/support/workflows/broken.workflow.yaml"] = "id: [unclosed\n";
    expect((await requests.offered()).map((one) => one.key)).toEqual(["support/support-reply"]);
  });

  describe("without an engine", () => {
    it("offers nothing and starts nothing", async () => {
      const { requests } = setup({ engine: false });
      expect(await requests.offered()).toEqual([]);
      await expect(requests.start("support/support-reply", "Hello")).rejects.toThrow("engine");
    });
  });

  describe("changes", () => {
    it("tells the Inbox when the files change, until it stops listening", () => {
      const { requests, listeners } = setup();
      const heard = vi.fn();
      const stop = requests.subscribe(heard);
      for (const listener of listeners) listener();
      expect(heard).toHaveBeenCalledTimes(1);
      stop();
      expect(listeners.size).toBe(0);
    });

    it("reads nothing until asked, so a run event costs no read", () => {
      const { read } = setup();
      expect(read).not.toHaveBeenCalled();
    });
  });
});
