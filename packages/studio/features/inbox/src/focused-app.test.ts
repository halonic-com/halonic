import { createShell } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { InboxRunsService } from "./api.ts";
import { inboxFeature } from "./feature.ts";

verifies("shell.focused-apps", () => {
  it("adds Halonic Inbox as a focused app: the Inbox place's own page, drawing its own framed panel", async () => {
    const shell = createShell({ features: [inboxFeature], hostServices: [InboxRunsService] });
    const [app] = shell.contributions.focusedApps.list();
    const place = shell.contributions.places.list().find((each) => each.id === "inbox");

    expect(app).toMatchObject({ id: "inbox", title: "Inbox", featureId: "inbox" });
    expect(app?.panel).toBeUndefined();
    expect(place?.view).toBe("InboxPage");
    expect(Object.keys(await (app?.load() ?? Promise.resolve({})))).toEqual(
      expect.arrayContaining([app?.view, place?.view]),
    );
  });
});
