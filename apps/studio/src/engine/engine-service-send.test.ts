import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { acmeFiles, fakeShell, lockCalls, serviceOn } from "./engine-service.testing.ts";

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

    it("passes on the executor's refusal of a run that doesn't exist", async () => {
      const service = serviceOn(fakeShell());

      await expect(service.send("run-gone", "approve")).rejects.toThrow();
      await service.close();
    });
  });
});
