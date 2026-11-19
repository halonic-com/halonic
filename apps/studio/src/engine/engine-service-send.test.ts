import { TauriRunStore } from "@halonicjs/adapter-fs-tauri";
import type { RunSummary } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { acmeFiles, fakeShell, lockCalls, serviceOn } from "./engine-service.testing.ts";

/** A run that waits for a person to approve the call `c1` of `tool`, from `connector` when given. */
function waitingOn(connector?: string): RunSummary {
  const approval = { agent: "writer", tool: "create_issue", callId: "c1", args: {} };
  return {
    id: "run1",
    status: "waiting",
    approvals: [{ ...approval, ...(connector === undefined ? {} : { connector }) }],
  } as unknown as RunSummary;
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
      ).rejects.toMatchObject({ kind: "unavailable", fix: "halonic runs send run1 approve" });

      expect(send).not.toHaveBeenCalled();
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

    it("fails as `unavailable`, naming the other engine, while another engine holds the workspace", async () => {
      const shell = fakeShell({ pid: 4242 });
      const service = serviceOn(shell);

      const refusal = await service.send("run1", "approve").catch((error: unknown) => error);

      expect(refusal).toMatchObject({
        kind: "unavailable",
        message:
          "This workspace is open in another engine (process 4242). Close it, then try again.",
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
