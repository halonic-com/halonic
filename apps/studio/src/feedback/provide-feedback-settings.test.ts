import { ServiceRegistry } from "@halonicjs/app";
import { FeedbackSettingsService } from "@halonicjs/studio-feature-feedback/api";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { feedbackSettingsOf, provideFeedbackSettings } from "./provide-feedback-settings.ts";

/** A shell whose `shortcut_set` refuses with `refusal`, or saves without one. */
function shell(refusal?: unknown) {
  return {
    invoke: vi.fn(async (_command: string, _args?: Record<string, unknown>) => {
      if (refusal !== undefined) throw refusal;
      return null;
    }),
  };
}

describe("provideFeedbackSettings", () => {
  verifies("studio.feedback-settings", () => {
    it("gives the main window the shell's shortcut_set, with its platform", async () => {
      const services = new ServiceRegistry();
      const ipc = shell();
      provideFeedbackSettings(services, ipc, "main", "macos");

      const host = services.get(FeedbackSettingsService);
      expect(host.platform).toBe("macos");
      expect(await host.setShortcut("Control+Alt+KeyK")).toBe("saved");
      expect(ipc.invoke).toHaveBeenCalledWith("plugin:feedback|shortcut_set", {
        shortcut: "Control+Alt+KeyK",
      });
    });

    it("answers with the refusal the shell names, and throws any other", async () => {
      await expect(feedbackSettingsOf(shell("taken"), "linux").setShortcut("x")).resolves.toBe(
        "taken",
      );
      await expect(feedbackSettingsOf(shell("invalid"), "linux").setShortcut("x")).resolves.toBe(
        "invalid",
      );
      await expect(
        feedbackSettingsOf(shell(new Error("gone")), "linux").setShortcut("x"),
      ).rejects.toThrow("plugin:feedback|shortcut_set refused: Error: gone");
    });

    it("gives none to another window or the served Studio", () => {
      const services = new ServiceRegistry();
      provideFeedbackSettings(services, shell(), "inbox", "linux");
      provideFeedbackSettings(services, undefined, "main", "linux");
      expect(services.has(FeedbackSettingsService)).toBe(false);
    });
  });
});
