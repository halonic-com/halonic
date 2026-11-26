import { showPlace } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
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
});
