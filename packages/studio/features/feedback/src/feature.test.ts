import { createShell, limitedLookup, type WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { FeedbackSettingsService } from "./api.ts";
import { feedbackFeature, feedbackSettingsAvailable } from "./feature.ts";

/** A feature context that finds the feedback settings only when `given`. */
function contextWith(given: boolean): WorkspaceContext {
  const host = { platform: "linux", setShortcut: async () => "saved" };
  const find = (key: { name: string }) =>
    given && key.name === FeedbackSettingsService.name ? host : undefined;
  const services = limitedLookup(feedbackFeature, { get: find, find } as never);
  return { services } as unknown as WorkspaceContext;
}

describe("feedbackFeature", () => {
  it("is registered under its folder name", () => {
    expect(feedbackFeature.id).toBe("feedback");
  });

  it("adds Keyboard and Feedback to Settings, on this computer and not on a phone", () => {
    const shell = createShell({ features: [feedbackFeature] });
    const sections = shell.contributions.settings
      .list()
      .map(({ id, title, scope, phone }) => ({ id, title, scope, phone }));
    expect(sections).toEqual([
      { id: "keyboard", title: "Keyboard", scope: "host", phone: false },
      { id: "feedback", title: "Feedback", scope: "host", phone: false },
    ]);
  });
});

verifies("feedback.settings-section", () => {
  it("shows the sections only where the app gives the feedback settings", () => {
    const heard: boolean[] = [];
    feedbackSettingsAvailable(contextWith(true), (available) => heard.push(available))();
    feedbackSettingsAvailable(contextWith(false), (available) => heard.push(available))();

    expect(heard).toEqual([true, false]);
  });
});
