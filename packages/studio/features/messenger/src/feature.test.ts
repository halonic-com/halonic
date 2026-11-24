import { createShell } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { messengerFeature } from "./feature.ts";

describe("messengerFeature", () => {
  it("is registered under its folder name", () => {
    expect(messengerFeature.id).toBe("messenger");
  });
});

verifies("shell.focused-apps", () => {
  it("adds Halonic Messenger as a focused app that draws its own panel, and no Studio place", async () => {
    const shell = createShell({ features: [messengerFeature] });
    const [app] = shell.contributions.focusedApps.list();

    expect(app).toMatchObject({ id: "messenger", title: "Messenger", featureId: "messenger" });
    expect(app?.panel).toBeUndefined();
    expect(Object.keys(await (app?.load() ?? Promise.resolve({})))).toContain(app?.view);
    expect(shell.contributions.places.list().map((place) => place.id)).toEqual(["home"]);
  });
});
