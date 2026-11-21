import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { acmeFiles, fakeShell, lockCalls, serviceOn } from "./engine-service.testing.ts";

verifies("studio.engine-cancel", () => {
  it("opens the engine and has the executor end the run as cancelled", async () => {
    const shell = fakeShell();
    const service = serviceOn(shell);
    const { executor } = await service.open();
    const ended = { id: "run1", status: "failed" };
    const cancel = vi.spyOn(executor, "cancel").mockResolvedValue(ended as never);

    await expect(service.cancel("run1")).resolves.toBe(ended);

    expect(cancel).toHaveBeenCalledWith("run1");
    expect(lockCalls(shell)).toEqual(["engine_lock_hold"]);
    await service.close();
  });

  it("is refused as `denied`, and the lock given back, when the workspace may start nothing", async () => {
    const shell = fakeShell();
    const service = serviceOn(shell, acmeFiles(), { mayStart: async () => false });

    await expect(service.cancel("run1")).rejects.toMatchObject({ kind: "denied" });

    expect(lockCalls(shell)).toEqual(["engine_lock_hold", "engine_lock_release"]);
  });

  it("passes on the engine's refusal of a run it doesn't know", async () => {
    const service = serviceOn(fakeShell());

    await expect(service.cancel("run_unknown")).rejects.toMatchObject({
      code: "engine.run-unknown",
    });
    await service.close();
  });
});
