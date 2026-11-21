import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { setup } from "./workspace-routines.test-helper.ts";

verifies("studio.workspace-routines-refused", () => {
  it("tells its listeners when the engine adds to a routine's skips, and stops when asked", async () => {
    const skipListeners = new Set<() => void>();
    const { host } = setup({
      onSkips: (listener) => {
        skipListeners.add(listener);
        return () => skipListeners.delete(listener);
      },
    });
    let told = 0;
    const stop = host.subscribe(() => {
      told += 1;
    });
    for (const listener of skipListeners) listener();
    expect(told).toBe(1);
    stop();
    expect(skipListeners.size).toBe(0);
  });
});
