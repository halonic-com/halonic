import { TauriRunStore, webCryptoDigest } from "@halonicjs/adapter-fs-tauri";
import { MemoryToolApprovalStore } from "@halonicjs/adapter-memory";
import type { RunEvent, RunSummary, RunVersion } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { studioListedToolApproval } from "../connect/studio-run-connectors.ts";
import { acmeFiles, fakeShell, location, lockCalls, serviceOn } from "./engine-service.testing.ts";

/** A run that waits for a person to approve the call `c1` of `tool`, from `connector` when given. */
function waitingOn(connector?: string): RunSummary {
  const approval = { agent: "writer", tool: "create_issue", callId: "c1", args: {} };
  return {
    id: "run1",
    hubId: "support",
    status: "waiting",
    approvals: [{ ...approval, ...(connector === undefined ? {} : { connector }) }],
  } as unknown as RunSummary;
}

/** The `run.started` of `run1`, reading `version`. */
function startedReading(version: RunVersion): RunEvent {
  return {
    runId: "run1",
    seq: 1,
    at: "2026-11-21T09:00:00.000Z",
    type: "run.started",
    hubId: "support",
    workflowId: "reply",
    input: {},
    kind: "run",
    definitionsVersion: "sha-1",
    version,
  };
}

verifies("studio.engine-service", () => {
  describe("an answer to a waiting run", () => {
    it("opens the engine and sends the answer, with the call it answers, to the executor", async () => {
      const shell = fakeShell();
      const service = serviceOn(shell);
      const { executor } = await service.open();
      const summary = { id: "run1" };
      const send = vi.spyOn(executor, "send").mockResolvedValue(summary as never);

      const answered = await service.send("run1", "approve", { comment: "ok" }, { callId: "c1" });

      expect(answered).toBe(summary);
      expect(send).toHaveBeenCalledWith("run1", "approve", { comment: "ok" }, { callId: "c1" });
      expect(lockCalls(shell)).toEqual(["engine_lock_hold"]);
      await service.close();
    });

    it("is refused as `denied`, and the lock given back, when the workspace may start nothing", async () => {
      const shell = fakeShell();
      const service = serviceOn(shell, acmeFiles(), { mayStart: async () => false });

      await expect(service.send("run1", "approve")).rejects.toMatchObject({ kind: "denied" });

      expect(lockCalls(shell)).toEqual(["engine_lock_hold", "engine_lock_release"]);
    });

    it("refuses an Approve of a connector's tool call as `unavailable`, with the CLI line, and sends nothing", async () => {
      const service = serviceOn(fakeShell());
      const { executor } = await service.open();
      vi.spyOn(TauriRunStore.prototype, "get").mockResolvedValue(waitingOn("github"));
      const send = vi.spyOn(executor, "send");

      await expect(
        service.send("run1", "approve", undefined, { callId: "c1" }),
      ).rejects.toMatchObject({
        kind: "unavailable",
        message:
          "This window can't run tools from github yet. To approve this one, run this in a terminal:",
        fix: "halonic runs send run1 approve",
      });

      expect(send).not.toHaveBeenCalled();
      vi.restoreAllMocks();
      await service.close();
    });

    it("names the connector as the Library does, by its name, in that refusal", async () => {
      const notes = {
        "hubs/support/library/connectors/notes.connector.yaml":
          "id: notes\nname: Notes\ntransport:\n  stdio:\n    command: notes-mcp\n",
      };
      const service = serviceOn(fakeShell(), acmeFiles({}, notes));
      await service.open();
      vi.spyOn(TauriRunStore.prototype, "get").mockResolvedValue(waitingOn("notes"));

      await expect(
        service.send("run1", "approve", undefined, { callId: "c1" }),
      ).rejects.toMatchObject({
        message:
          "This window can't run tools from Notes yet. To approve this one, run this in a terminal:",
      });

      vi.restoreAllMocks();
      await service.close();
    });

    it("sends a Reject of a connector's tool call, and an Approve of a built-in tool's", async () => {
      const service = serviceOn(fakeShell());
      const { executor } = await service.open();
      const get = vi.spyOn(TauriRunStore.prototype, "get");
      const send = vi.spyOn(executor, "send").mockResolvedValue({ id: "run1" } as never);

      get.mockResolvedValue(waitingOn("github"));
      await service.send("run1", "reject", { comment: "not this one" }, { callId: "c1" });
      get.mockResolvedValue(waitingOn());
      await service.send("run1", "approve", undefined, { callId: "c1" });

      expect(send.mock.calls.map(([, event]) => event)).toEqual(["reject", "approve"]);
      vi.restoreAllMocks();
      await service.close();
    });

    it("where the agent host starts connectors, sends that Approve for a run on the saved files only", async () => {
      const service = serviceOn(fakeShell(), acmeFiles(), {
        openRunConnectors: async () => ({
          connectors: { open: async () => [], end: async () => {}, closeAll: async () => {} },
          listedToolApproval: await studioListedToolApproval({
            definitions: acmeFiles(),
            folder: { locationOf: async () => location },
            approvals: new MemoryToolApprovalStore(),
            digest: webCryptoDigest,
            clock: { now: () => new Date("2026-11-21T09:00:00.000Z") },
            reportWaiting: () => undefined,
          }),
        }),
      });
      const { executor } = await service.open();
      vi.spyOn(TauriRunStore.prototype, "get").mockResolvedValue(waitingOn("github"));
      vi.spyOn(TauriRunStore.prototype, "snapshot").mockResolvedValue(null);
      const events = vi.spyOn(TauriRunStore.prototype, "events");
      const send = vi.spyOn(executor, "send").mockResolvedValue({ id: "run1" } as never);

      events.mockResolvedValue([startedReading({ reads: "saved-files" })]);
      await service.send("run1", "approve", undefined, { callId: "c1" });
      events.mockResolvedValue([
        startedReading({ reads: "live-version", commit: "abc1234", versionDate: "2026-11-20" }),
      ]);
      await expect(
        service.send("run1", "approve", undefined, { callId: "c1" }),
      ).rejects.toMatchObject({ kind: "unavailable", fix: "halonic runs send run1 approve" });

      expect(send).toHaveBeenCalledTimes(1);
      vi.restoreAllMocks();
      await service.close();
    });

    it("fails as `unavailable`, naming the other engine, while another engine holds the workspace", async () => {
      const shell = fakeShell({ pid: 4242 });
      const service = serviceOn(shell);

      const refusal = await service.send("run1", "approve").catch((error: unknown) => error);

      expect(refusal).toMatchObject({
        kind: "unavailable",
        message:
          "Acme is already running in another Halonic on this computer (process 4242). Stop that one, then try again.",
        fix: undefined,
      });
    });

    it("passes on the executor's refusal of a run that doesn't exist", async () => {
      const service = serviceOn(fakeShell());

      await expect(service.send("run-gone", "approve")).rejects.toThrow();
      await service.close();
    });
  });
});
