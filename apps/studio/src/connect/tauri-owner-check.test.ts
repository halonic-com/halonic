import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { tauriOwnerCheckAvailable } from "./tauri-owner-check.ts";

verifies("remote.phone-remote-answers", () => {
  it("asks the shell's owner_check_available with nothing from the page", async () => {
    const invoke = vi.fn(() => Promise.resolve({ approval: true, answer: true }));
    const report = vi.fn();

    await expect(tauriOwnerCheckAvailable({ invoke }, report)()).resolves.toEqual({
      approval: true,
      answer: true,
    });
    expect(invoke.mock.calls).toEqual([["owner_check_available"]]);
    expect(report).not.toHaveBeenCalled();
  });

  it("keeps the two answers apart, as on a phone with only a PIN", async () => {
    const invoke = () => Promise.resolve({ approval: false, answer: true });
    await expect(tauriOwnerCheckAvailable({ invoke }, vi.fn())()).resolves.toEqual({
      approval: false,
      answer: true,
    });
  });

  it.each<[string, () => Promise<unknown>]>([
    ["a plain true from an older shell", () => Promise.resolve(true)],
    ["answers that aren't booleans", () => Promise.resolve({ approval: "yes", answer: 1 })],
    ["no answer", () => Promise.resolve(null)],
    ["a refusal", () => Promise.reject(new Error("not allowed"))],
  ])("reads %s as no for both", async (_, invoke) => {
    await expect(tauriOwnerCheckAvailable({ invoke }, vi.fn())()).resolves.toEqual({
      approval: false,
      answer: false,
    });
  });
});
