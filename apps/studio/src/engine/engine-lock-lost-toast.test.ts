import { createToastStore } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { showEngineLockLost } from "./engine-lock-lost-toast.ts";
import { fakeShell, serviceOn } from "./engine-service.testing.ts";

verifies("studio.engine-lock-lost-toast", () => {
  it("says another Halonic took over the workspace's runs, with Open Runs", async () => {
    const shell = fakeShell();
    const toasts = createToastStore();
    const openRuns = vi.fn();
    const service = serviceOn(shell, undefined, {
      onLockLost: () => showEngineLockLost({ toasts, name: "Acme", openRuns }),
    });
    await service.open();

    shell.loseLock();

    const [toast] = toasts.list();
    expect(toasts.list()).toHaveLength(1);
    expect(toast).toMatchObject({
      tone: "info",
      title: "Another Halonic on this computer took over Acme's runs.",
      text: "This window stopped running them.",
    });
    toast?.action?.onClick();
    expect(openRuns).toHaveBeenCalledOnce();
    await service.close();
  });

  it("shows nothing while the window keeps its lock", async () => {
    const onLockLost = vi.fn();
    const service = serviceOn(fakeShell(), undefined, { onLockLost });

    await service.open();
    await service.close();

    expect(onLockLost).not.toHaveBeenCalled();
  });
});
