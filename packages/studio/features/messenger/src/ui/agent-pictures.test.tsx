// @vitest-environment jsdom
import type { AttachmentRead } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openChat, openMessenger, settle } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

/** A made-up picture's bytes; the stubbed decoder below only checks they came through. */
const pictureBytes = new Uint8Array([137, 80, 78, 71]);

interface FakePicture {
  readonly width: number;
  readonly height: number;
  closed: boolean;
  close(): void;
}

const decoded: FakePicture[] = [];
const drawn: FakePicture[] = [];

/** The picture decoder and canvas jsdom lacks. A closed picture refuses to be drawn, as a browser's does. */
beforeEach(() => {
  vi.stubGlobal("createImageBitmap", (blob: Blob) => {
    if (blob.type !== "image/png") return Promise.reject(new Error("not a picture"));
    const picture: FakePicture = {
      width: 2,
      height: 2,
      closed: false,
      close: () => {
        picture.closed = true;
      },
    };
    decoded.push(picture);
    return Promise.resolve(picture);
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: (picture: FakePicture) => {
      if (picture.closed) throw new Error("The picture was closed before it was drawn.");
      drawn.push(picture);
    },
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  unmountAll();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  decoded.length = 0;
  drawn.length = 0;
});

/** Acme's Liam with a picture, Chief without one, and Bo whose picture is a GIF; a chat with each. */
function acmeChats() {
  const messaging = new FakeAgentMessaging();
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const png = { name: "liam.png", type: "image/png", bytes: pictureBytes };
  const liam = messaging.addAgent(acme.id, { name: "Liam", title: "CTO", picture: png });
  const chief = messaging.addAgent(acme.id, { name: "Chief" });
  const bo = messaging.addAgent(acme.id, { name: "Bo", picture: { ...png, type: "image/gif" } });
  for (const agent of [liam, chief, bo]) messaging.addConversation(agent.id);
  return { messaging, acme, liam, chief };
}

/** The row's avatar: a canvas for a picture, otherwise the initials' tile. */
function rowAvatar(page: HTMLElement, name: string): Element | null | undefined {
  const row = [...page.querySelectorAll("nav li button")].find((each) =>
    each.textContent?.includes(name),
  );
  return row?.firstElementChild;
}

verifies("messenger.agent-pictures", () => {
  describe("an agent's picture", () => {
    it("is drawn in the chat's row and header, read once", async () => {
      const { messaging } = acmeChats();
      const reads = vi.spyOn(messaging, "readAttachment");
      const page = await openMessenger(messaging);

      expect(rowAvatar(page, "Liam")?.querySelector("canvas")).not.toBeNull();
      await openChat(page, "Liam");
      expect(
        page.querySelector("main header")?.firstElementChild?.querySelector("canvas"),
      ).not.toBeNull();
      // Liam's picture and Bo's GIF are each read once; only Liam's decodes, in both places.
      expect(reads).toHaveBeenCalledTimes(2);
      expect(decoded).toHaveLength(1);
      expect(new Set(drawn)).toEqual(new Set([decoded[0]]));
    });

    it("isn't read again when the list is read again", async () => {
      const { messaging, chief } = acmeChats();
      const reads = vi.spyOn(messaging, "readAttachment");
      const page = await openMessenger(messaging);
      const before = reads.mock.calls.length;

      await act(async () => messaging.addConversation(chief.id));
      await settle();

      expect(page.querySelectorAll("nav li")).toHaveLength(4);
      expect(reads.mock.calls.length).toBe(before);
    });

    it("leaves the initial for an agent without one, or whose picture isn't PNG, JPEG or WebP", async () => {
      const page = await openMessenger(acmeChats().messaging);
      expect(rowAvatar(page, "Chief")?.textContent).toBe("C");
      expect(rowAvatar(page, "Bo")?.textContent).toBe("B");
    });

    it("leaves the initial when the read is refused or fails, and closes what it read on leaving", async () => {
      const { messaging } = acmeChats();
      const refused: AttachmentRead = { outcome: "refused", reason: "offline" };
      vi.spyOn(messaging, "readAttachment").mockResolvedValueOnce(refused);
      const page = await openMessenger(messaging);
      expect(rowAvatar(page, "Liam")?.textContent).toBe("L");

      const other = acmeChats().messaging;
      vi.spyOn(other, "readAttachment").mockRejectedValue(new Error("engine gone"));
      const second = await openMessenger(other);
      expect(rowAvatar(second, "Liam")?.textContent).toBe("L");
      expect(console.warn).toHaveBeenCalled();

      const third = await openMessenger(acmeChats().messaging);
      expect(rowAvatar(third, "Liam")?.querySelector("canvas")).not.toBeNull();
      unmountAll();
      expect(decoded.every((picture) => picture.closed)).toBe(true);
    });
  });
});
