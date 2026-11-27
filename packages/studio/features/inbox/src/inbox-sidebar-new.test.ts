import { createShell, showPlace } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { InboxRunsService, InboxService } from "./api.ts";
import { fakeRuns, WorkspaceServices } from "./fake-runs.test-helper.ts";
import { inboxFeature } from "./feature.ts";
import { inboxNewSignal } from "./inbox-count.ts";
import { inboxItems } from "./inbox-items.ts";
import { readKey, StoredReadMarks } from "./read-marks.ts";
import { waitingRun } from "./test-runs.test-helper.ts";

/** Each item's read key, in order. */
const keysOf = (items: ReturnType<typeof inboxItems>) => items.map(readKey);

verifies("inbox.sidebar-new", () => {
  it("counts the new items that wait, heard with all that wait", () => {
    const items = inboxItems([waitingRun("r1"), waitingRun("r2"), waitingRun("r3")]);
    const marks = new StoredReadMarks(null);
    marks.markRead(keysOf(items).slice(0, 1));

    const signal = inboxNewSignal(items, marks);
    expect(signal).toEqual({ mark: "new", value: 2, spoken: "2 new, 3 waiting" });
    expect(showPlace("inbox", signal).spokenName).toBe("Inbox, 2 new, 3 waiting");
  });

  it("shows nothing once every item that waits is read, though they still wait", () => {
    const items = inboxItems([waitingRun("r1"), waitingRun("r2")]);
    const marks = new StoredReadMarks(null);
    marks.markRead(keysOf(items));

    expect(inboxNewSignal(items, marks).value).toBe(0);
    expect(showPlace("inbox", inboxNewSignal(items, marks))).toMatchObject({
      signal: undefined,
      spokenName: "Inbox",
    });
  });

  it("tells the sidebar when a mark changes, so the count follows it", () => {
    const items = inboxItems([waitingRun("r1")]);
    const [key = ""] = keysOf(items);
    const marks = new StoredReadMarks(null);
    const listener = vi.fn();
    const stop = marks.subscribe(listener);

    marks.markRead([key]);
    expect(listener).toHaveBeenCalledOnce();
    expect(inboxNewSignal(items, marks).value).toBe(0);
    marks.markUnread(key);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(inboxNewSignal(items, marks).value).toBe(1);

    stop();
    marks.markRead([key]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("tells the sidebar through the place when an item is opened, and its count drops", async () => {
    const shell = createShell({ features: [inboxFeature], hostServices: [InboxRunsService] });
    const workspace = new WorkspaceServices();
    workspace.provide(InboxRunsService, fakeRuns([waitingRun("r1")]).runs);
    shell.services.instantiate(workspace);
    const place = shell.contributions.places.list().find((added) => added.id === "inbox");
    const context = shell.services.contextFor("inbox", workspace);
    const inbox = workspace.get(InboxService);
    await inbox.refresh();
    expect(place?.signal?.(context)?.value).toBe(1);

    const listener = vi.fn();
    const stop = place?.subscribeSignal?.(context, listener);
    inbox.readMarks.markRead(inbox.state.items.map(readKey));
    expect(listener).toHaveBeenCalledOnce();
    expect(place?.signal?.(context)?.value).toBe(0);
    stop?.();
  });
});
