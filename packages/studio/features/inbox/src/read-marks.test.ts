import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it, vi } from "vitest";
import { keptMarks, type ReadMarkStorage, StoredReadMarks } from "./read-marks.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

/** A device's storage that keeps its keys in a map, as `localStorage` does. */
function deviceStorage(): ReadMarkStorage & { readonly kept: Map<string, string> } {
  const kept = new Map<string, string>();
  return {
    kept,
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => void kept.set(key, value),
  };
}

verifies("inbox.read-marks", () => {
  it("keeps an opened item read for the next start, until it is marked unread", () => {
    const storage = deviceStorage();
    new StoredReadMarks(storage).markRead(["r1:call-1", "agent:item-1"]);
    const restarted = new StoredReadMarks(storage);
    expect(restarted.isRead("r1:call-1")).toBe(true);
    expect(restarted.isRead("agent:item-1")).toBe(true);
    expect(restarted.isRead("r2:call-1")).toBe(false);
    restarted.markUnread("r1:call-1");
    expect(new StoredReadMarks(storage).isRead("r1:call-1")).toBe(false);
  });

  it("leaves the marks another window kept in the meantime as they are", () => {
    const storage = deviceStorage();
    const studio = new StoredReadMarks(storage);
    const inboxWindow = new StoredReadMarks(storage);
    expect(studio.isRead("r1:call-1")).toBe(false);
    inboxWindow.markRead(["r1:call-1"]);
    studio.markRead(["r2:call-1"]);
    const restarted = new StoredReadMarks(storage);
    expect(restarted.isRead("r1:call-1")).toBe(true);
    expect(restarted.isRead("r2:call-1")).toBe(true);
  });

  it("keeps the newest marks only, so the device's key stops growing", () => {
    const storage = deviceStorage();
    let minute = 0;
    const marks = new StoredReadMarks(storage, () => new Date(Date.UTC(2026, 10, 26, 0, minute++)));
    for (let index = 0; index <= keptMarks; index++) marks.markRead([`r${index}:call`]);
    const restarted = new StoredReadMarks(storage);
    expect(restarted.isRead("r0:call")).toBe(false);
    expect(restarted.isRead("r1:call")).toBe(true);
    expect(restarted.isRead(`r${keptMarks}:call`)).toBe(true);
  });

  it("keeps the marks in the page and says so when the device refuses them", () => {
    const failed = vi.spyOn(console, "error").mockImplementation(() => {});
    const full: ReadMarkStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    const marks = new StoredReadMarks(full);
    marks.markRead(["r1:call-1"]);
    expect(marks.isRead("r1:call-1")).toBe(true);
    expect(failed).toHaveBeenCalledWith(
      "Couldn't keep the Inbox's read marks on this device.",
      expect.any(Error),
    );
  });
});

verifies("inbox.sidebar-new", () => {
  /** What the browser fires in this window when another window changes `storageArea`. */
  const storageEvent = (key: string | null, storageArea: unknown) =>
    Object.assign(new Event("storage"), { key, storageArea });

  it("tells its listeners when another window changes the marks, and reads them again", () => {
    const storage = deviceStorage();
    const studioWindow = new EventTarget();
    const studio = new StoredReadMarks(storage, undefined, studioWindow);
    const inboxWindow = new StoredReadMarks(storage);
    const listener = vi.fn();
    const stop = studio.subscribe(listener);
    expect(studio.isRead("r1:call-1")).toBe(false);

    inboxWindow.markRead(["r1:call-1"]);
    studioWindow.dispatchEvent(storageEvent("halonic.inbox.read", storage));
    expect(listener).toHaveBeenCalledOnce();
    expect(studio.isRead("r1:call-1")).toBe(true);

    // Another window cleared the whole storage.
    storage.kept.clear();
    studioWindow.dispatchEvent(storageEvent(null, storage));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(studio.isRead("r1:call-1")).toBe(false);

    studioWindow.dispatchEvent(storageEvent("other.key", storage));
    studioWindow.dispatchEvent(storageEvent("halonic.inbox.read", deviceStorage()));
    stop();
    studioWindow.dispatchEvent(storageEvent("halonic.inbox.read", storage));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
