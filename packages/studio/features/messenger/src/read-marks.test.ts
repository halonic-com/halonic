import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Messenger } from "./messenger.ts";
import { type ReadMarkStorage, StoredReadMarks } from "./read-marks.ts";

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

/** Acme's Chief, whose messages come a minute apart. */
function acme() {
  let minute = 0;
  const messaging = new FakeAgentMessaging({
    now: () => new Date(Date.UTC(2026, 10, 26, 9, minute++)),
  });
  const source = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(source.id, { name: "Chief" });
  const chat = messaging.addConversation(chief.id);
  messaging.addMessage(chat.id, { body: "Tests are green." });
  messaging.addMessage(chat.id, { body: "Shall I merge #12?" });
  return { messaging, source, chat };
}

async function chiefRow(messenger: Messenger) {
  const [row] = await messenger.rows();
  if (row === undefined) throw new Error("no row");
  return row;
}

verifies("messenger.read-marks", () => {
  it("keeps a chat read after Studio starts again", async () => {
    const { messaging, chat } = acme();
    const storage = deviceStorage();
    const before = new Messenger(messaging, undefined, undefined, new StoredReadMarks(storage));
    before.markSeen(await chiefRow(before), await messaging.listMessages(chat.id));

    const after = new Messenger(messaging, undefined, undefined, new StoredReadMarks(storage));

    expect(after.unreadCount(await chiefRow(after))).toBe(0);
  });

  it("marks a read chat unread with only its newest message, and read again", async () => {
    const { messaging, chat } = acme();
    const messenger = new Messenger(messaging);
    const row = await chiefRow(messenger);
    expect(messenger.unreadCount(row)).toBe(2);
    messenger.markSeen(row, await messaging.listMessages(chat.id));
    expect(messenger.canMarkUnread(row)).toBe(true);

    messenger.markUnread(row);
    expect(messenger.unreadCount(row)).toBe(1);

    messenger.markRead(row);
    expect(messenger.unreadCount(row)).toBe(0);
  });

  it("counts a message the agent sends after Mark as unread too", async () => {
    const { messaging, chat } = acme();
    const messenger = new Messenger(messaging);
    messenger.markSeen(await chiefRow(messenger), await messaging.listMessages(chat.id));
    messenger.markUnread(await chiefRow(messenger));

    messaging.addMessage(chat.id, { body: "Merged." });

    expect(messenger.unreadCount(await chiefRow(messenger))).toBe(2);
  });

  it("has nothing to mark unread once the person wrote last", async () => {
    const { messaging, chat } = acme();
    const messenger = new Messenger(messaging);
    messaging.addMessage(chat.id, { body: "Yes", author: { kind: "me" } });

    expect(messenger.canMarkUnread(await chiefRow(messenger))).toBe(false);
  });

  it("forgets the marks of chats an online source no longer lists, not an offline one's", async () => {
    const { messaging, source } = acme();
    const storage = deviceStorage();
    const key = `halonic.messenger.read.${source.id}`;
    storage.setItem(key, JSON.stringify({ gone: "2026-11-20T09:00:00.000Z" }));

    messaging.goOffline(source.id);
    await new Messenger(messaging, undefined, undefined, new StoredReadMarks(storage)).rows();
    expect(storage.kept.get(key)).toContain("gone");

    messaging.goOnline(source.id);
    await new Messenger(messaging, undefined, undefined, new StoredReadMarks(storage)).rows();
    expect(storage.kept.get(key)).toBe("{}");
  });

  it("keeps the marks of an online source that lists no chats in one read", async () => {
    const { messaging, source, chat } = acme();
    const storage = deviceStorage();
    const messenger = new Messenger(messaging, undefined, undefined, new StoredReadMarks(storage));
    messenger.markSeen(await chiefRow(messenger), await messaging.listMessages(chat.id));
    // As the hub answers for a source whose read failed while another source answered.
    vi.spyOn(messaging, "listConversations").mockResolvedValueOnce([]);

    await messenger.rows();

    expect(storage.kept.get(`halonic.messenger.read.${source.id}`)).toContain(chat.id);
    expect(messenger.unreadCount(await chiefRow(messenger))).toBe(0);
  });
});

describe("StoredReadMarks", () => {
  it("never overwrites another window's newer marks with its older copy", () => {
    const storage = deviceStorage();
    const messengerWindow = new StoredReadMarks(storage);
    const quickAsk = new StoredReadMarks(storage);
    quickAsk.set("acme", "liam", "2026-11-26T08:00:00.000Z");
    expect(messengerWindow.of("acme", "liam")).toBe("2026-11-26T08:00:00.000Z");

    messengerWindow.set("acme", "chief", "2026-11-26T09:00:00.000Z");
    quickAsk.keepOnly("acme", ["chief"]);

    const kept = new StoredReadMarks(storage);
    expect(kept.of("acme", "chief")).toBe("2026-11-26T09:00:00.000Z");
    expect(kept.of("acme", "liam")).toBeUndefined();
  });

  it("logs storage that refuses a mark, and keeps it for this page", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const marks = new StoredReadMarks({
      getItem: () => null,
      setItem: () => {
        throw new Error("full");
      },
    });

    marks.set("acme", "chief", "2026-11-26T09:00:00.000Z");

    expect(marks.of("acme", "chief")).toBe("2026-11-26T09:00:00.000Z");
    expect(error).toHaveBeenCalledOnce();
  });

  it("reads marks it can't parse as none, and says so", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const marks = new StoredReadMarks({ getItem: () => "{not json", setItem: () => undefined });

    expect(marks.of("acme", "chief")).toBeUndefined();
    expect(error).toHaveBeenCalledOnce();
  });
});
