import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { type DraftFile, isPicture } from "./draft-files.ts";
import { Messenger } from "./messenger.ts";

/** A file of `size` bytes, each 7, that reads only when asked. */
function fileOf(name: string, type: string, size: number): DraftFile {
  return {
    name,
    type,
    size,
    arrayBuffer: () => Promise.resolve(new Uint8Array(size).fill(7).buffer),
  };
}

function chiefChat() {
  const messaging = new FakeAgentMessaging();
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(acme.id, { name: "Chief" });
  const chat = messaging.addConversation(chief.id);
  return { messaging, acme, chat };
}

async function chiefRow(messenger: Messenger) {
  const [row] = await messenger.rows();
  if (row === undefined) throw new Error("no chat");
  return row;
}

verifies("messenger.files", () => {
  describe("Messenger.files", () => {
    it("takes 5 files in a box and refuses a sixth", () => {
      const { messaging, chat } = chiefChat();
      const messenger = new Messenger(messaging);
      for (let count = 0; count < 5; count += 1) {
        expect(
          messenger.files.add(chat.id, fileOf(`${count}.png`, "image/png", 1)),
        ).toBeUndefined();
      }
      expect(messenger.files.add(chat.id, fileOf("6.png", "image/png", 1))).toBe("too-many");
      expect(messenger.files.of(chat.id)).toHaveLength(5);
      messenger.files.remove(chat.id, 0);
      expect(messenger.files.of(chat.id).map((file) => file.name)).toEqual([
        "1.png",
        "2.png",
        "3.png",
        "4.png",
      ]);
    });

    it("sends the box's files with the draft and empties the box", async () => {
      const { messaging, chat } = chiefChat();
      const messenger = new Messenger(messaging);
      messenger.setDraft(chat.id, "Here");
      messenger.files.add(chat.id, fileOf("login.png", "image/png", 3));
      const outcome = await messenger.sendDraft(chat.id, await chiefRow(messenger));
      expect(outcome.outcome).toBe("sent");
      if (outcome.outcome === "sent") {
        expect(outcome.message.attachments.map((file) => [file.name, file.size])).toEqual([
          ["login.png", 3],
        ]);
      }
      expect(messenger.files.of(chat.id)).toEqual([]);
    });

    it("offline, keeps the files and the draft, and reads and sends nothing", async () => {
      const { messaging, acme, chat } = chiefChat();
      messaging.goOffline(acme.id);
      const send = vi.spyOn(messaging, "send");
      const messenger = new Messenger(messaging);
      const file = fileOf("login.png", "image/png", 3);
      const read = vi.spyOn(file, "arrayBuffer");
      messenger.setDraft(chat.id, "Here");
      messenger.files.add(chat.id, file);
      const outcome = await messenger.sendDraft(chat.id, await chiefRow(messenger));
      expect(outcome).toEqual({ outcome: "kept", reason: "offline" });
      expect(send).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
      expect(messenger.files.of(chat.id)).toHaveLength(1);
    });

    it("draws only PNG, JPEG, GIF and WebP as pictures, never SVG", () => {
      expect(["image/png", "image/jpeg", "image/gif", "image/webp"].every(isPicture)).toBe(true);
      expect(isPicture("image/svg+xml")).toBe(false);
      expect(isPicture("text/html")).toBe(false);
    });
  });
});
