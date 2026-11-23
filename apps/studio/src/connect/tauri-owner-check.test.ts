import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { tauriOwnerCheckAvailable } from "./tauri-owner-check.ts";

verifies("remote.phone-remote-answers", () => {
  it("asks the shell's owner_check_available with nothing from the page", async () => {
    const invoke = vi.fn(() => Promise.resolve(true));
    const report = vi.fn();

    await expect(tauriOwnerCheckAvailable({ invoke }, report)()).resolves.toBe(true);
    expect(invoke.mock.calls).toEqual([["owner_check_available"]]);
    expect(report).not.toHaveBeenCalled();
  });

  it.each<[string, () => Promise<unknown>]>([
    ["a false answer", () => Promise.resolve(false)],
    ["an answer that isn't a boolean", () => Promise.resolve("yes")],
    ["a refusal", () => Promise.reject(new Error("not allowed"))],
  ])("reads %s as no", async (_, invoke) => {
    await expect(tauriOwnerCheckAvailable({ invoke }, vi.fn())()).resolves.toBe(false);
  });
});
