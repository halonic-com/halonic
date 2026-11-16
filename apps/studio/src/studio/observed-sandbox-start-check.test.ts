import type { SandboxStartResult } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { observedSandboxStartCheck } from "./observed-sandbox-start-check.ts";

verifies("studio.sandbox-start-check", () => {
  it("tells listeners when a check passes, and returns the result unchanged", async () => {
    const { check, passes } = observedSandboxStartCheck({ check: async () => ({ ok: true }) });
    const heard = vi.fn();
    const stop = passes.subscribe(heard);
    expect(await check.check()).toEqual({ ok: true });
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    await check.check();
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("tells no one about a refusal or a check that can't run", async () => {
    const results: (() => Promise<SandboxStartResult>)[] = [
      async () => ({ ok: false, reason: "ripgrep-missing" }),
      async () => {
        throw new Error("no host");
      },
    ];
    const { check, passes } = observedSandboxStartCheck({
      check: () => (results.shift() ?? (async () => ({ ok: true as const })))(),
    });
    const heard = vi.fn();
    passes.subscribe(heard);
    expect(await check.check()).toEqual({ ok: false, reason: "ripgrep-missing" });
    await expect(check.check()).rejects.toThrow("no host");
    expect(heard).not.toHaveBeenCalled();
  });
});
