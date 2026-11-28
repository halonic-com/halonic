import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { pinnedFirst, StoredChatPins } from "./chat-pins.ts";

/** A `localStorage` stand-in. */
function memory(): Pick<Storage, "getItem" | "setItem"> {
  const kept = new Map<string, string>();
  return {
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => void kept.set(key, value),
  };
}

const chat = (conversation: string) => ({ source: "acme", conversation });

verifies("messenger.pinned-chats", () => {
  describe("StoredChatPins", () => {
    it("lists the most recently pinned chat first and keeps at most 3", () => {
      const pins = new StoredChatPins(memory());
      for (const id of ["a", "b", "c"]) expect(pins.pin(chat(id))).toBe("pinned");
      expect(pins.pin(chat("d"))).toBe("full");
      expect(pins.list().map((pin) => pin.conversation)).toEqual(["c", "b", "a"]);
    });

    it("unpins a chat and makes room for another", () => {
      const pins = new StoredChatPins(memory());
      for (const id of ["a", "b", "c"]) pins.pin(chat(id));
      pins.unpin(chat("b"));
      expect(pins.pin(chat("d"))).toBe("pinned");
      expect(pins.list().map((pin) => pin.conversation)).toEqual(["d", "c", "a"]);
    });

    it("keeps the pins on the device, where another window reads them", () => {
      const storage = memory();
      new StoredChatPins(storage).pin(chat("a"));
      expect(new StoredChatPins(storage).list()).toEqual([chat("a")]);
    });

    it("keeps the pins for this page when storage refuses them, and says so", () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const pins = new StoredChatPins({
        getItem: () => {
          throw new Error("denied");
        },
        setItem: () => {
          throw new Error("denied");
        },
      });
      pins.pin(chat("a"));
      expect(pins.list()).toEqual([chat("a")]);
      expect(error).toHaveBeenCalled();
      error.mockRestore();
    });
  });

  describe("pinnedFirst", () => {
    it("puts the pinned rows first in pin order and keeps the others' order", () => {
      const row = (id: string) => ({ conversation: { source: "acme", id } });
      const rows = [row("a"), row("b"), row("c"), row("d")];
      const { pinned, others } = pinnedFirst(rows, [chat("c"), chat("a"), chat("gone")]);
      expect(pinned.map((each) => each.conversation.id)).toEqual(["c", "a"]);
      expect(others.map((each) => each.conversation.id)).toEqual(["b", "d"]);
    });
  });
});
