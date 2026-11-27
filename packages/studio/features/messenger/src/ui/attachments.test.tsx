// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { byText, openChat, openMessenger, press, typeAndSend } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

/**
 * The picture decoder and canvas jsdom lacks; the test only checks what was drawn and from what. A
 * closed bitmap refuses to be drawn, as a browser's does.
 */
const drawn: unknown[] = [];

beforeEach(() => {
  vi.stubGlobal("createImageBitmap", (blob: Blob) => {
    const picture = { width: 2, height: 1, closed: false, close: () => {}, blob };
    picture.close = () => {
      picture.closed = true;
    };
    return Promise.resolve(picture);
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: (picture: { readonly closed: boolean }) => {
      if (picture.closed) throw new Error("The picture was closed before it was drawn.");
      drawn.push(picture);
    },
  } as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  unmountAll();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  drawn.length = 0;
});

/** Acme's Chief and a chat with it. */
function chiefChat() {
  const messaging = new FakeAgentMessaging();
  const acme = messaging.addSource({ label: "Paperclip · Acme" });
  const chief = messaging.addAgent(acme.id, { name: "Chief" });
  const chat = messaging.addConversation(chief.id);
  return { messaging, acme, chat };
}

const screenshotBytes = new Uint8Array([137, 80, 78, 71]);

/** Pastes files into the chat's box, as a screenshot from the clipboard. */
async function paste(page: HTMLElement, files: readonly File[]): Promise<void> {
  const box = page.querySelector("textarea");
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { files } });
  await act(async () => box?.dispatchEvent(event));
}

/** Picks files with "Attach a file". */
async function attach(page: HTMLElement, files: readonly File[]): Promise<void> {
  const picker = page.querySelector<HTMLInputElement>('input[type="file"]');
  if (picker === null) throw new Error("no file picker");
  Object.defineProperty(picker, "files", { value: files, configurable: true });
  await act(async () => picker.dispatchEvent(new Event("change", { bubbles: true })));
}

function transcript(page: HTMLElement): HTMLElement {
  const list = page.querySelector<HTMLElement>("main ol");
  if (list === null) throw new Error("no transcript");
  return list;
}

verifies("messenger.files", () => {
  describe("files and screenshots in a chat", () => {
    it("sends a pasted screenshot with the message, and shows it only once asked", async () => {
      const { messaging, chat } = chiefChat();
      const send = vi.spyOn(messaging, "send");
      const read = vi.spyOn(messaging, "readAttachment");
      const page = await openMessenger(messaging);
      const box = await openChat(page, "Chief");
      await paste(page, [new File([screenshotBytes], "", { type: "image/png" })]);
      expect(page.querySelector("main")?.textContent).toContain("Screenshot.png");
      await typeAndSend(box, "Here");
      expect(send.mock.calls).toEqual([
        [chat.id, "Here", [{ name: "Screenshot.png", type: "image/png", bytes: screenshotBytes }]],
      ]);
      expect(transcript(page).textContent).toContain("Show Screenshot.png");
      // Nothing is read or drawn until the person asks.
      expect(read).not.toHaveBeenCalled();
      expect(transcript(page).querySelector("canvas, img")).toBeNull();
      await press(byText(page, "main ol button", "Show Screenshot.png"));
      expect(read).toHaveBeenCalledTimes(1);
      const picture = transcript(page).querySelector('canvas[role="img"]');
      expect(picture?.getAttribute("aria-label")).toBe("Screenshot.png");
      expect(drawn).toHaveLength(1);
      expect(transcript(page).querySelector("img")).toBeNull();
      // The button is gone, so focus moves to the picture rather than falling to the page.
      expect(document.activeElement).toBe(picture);
    });

    it("says a picture couldn't load as the Inbox does, and reads it again on Try again", async () => {
      const { messaging, chat } = chiefChat();
      messaging.addMessage(chat.id, {
        body: "Look",
        attachments: [{ name: "login.png", type: "image/png", bytes: screenshotBytes }],
      });
      const read = vi
        .spyOn(messaging, "readAttachment")
        .mockResolvedValueOnce({ outcome: "refused", reason: "offline" });
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      await press(byText(page, "main ol button", "Show login.png"));
      expect(transcript(page).textContent).toContain("login.png · 4 bytes");
      expect(transcript(page).textContent).toContain("Couldn't load the image.");
      await press(byText(page, "main ol button", "Try again"));
      expect(read).toHaveBeenCalledTimes(2);
      expect(transcript(page).querySelector('canvas[role="img"]')).not.toBeNull();
    });

    it("refuses a file over 10 MB with a message, and sends the message without it", async () => {
      const { messaging, chat } = chiefChat();
      const send = vi.spyOn(messaging, "send");
      const page = await openMessenger(messaging);
      const box = await openChat(page, "Chief");
      const huge = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "dump.txt", {
        type: "text/plain",
      });
      await attach(page, [huge]);
      expect(page.textContent).toContain("dump.txt is over 10 MB, so it wasn't added.");
      await typeAndSend(box, "Here");
      expect(send.mock.calls).toEqual([[chat.id, "Here"]]);
    });

    it("refuses an SVG, which can hold script, with a message", async () => {
      const { messaging } = chiefChat();
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      await attach(page, [new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" })]);
      expect(page.textContent).toContain("logo.svg can't be sent.");
    });

    it("shows a file that isn't a picture by its name and size, with nothing to load", async () => {
      const { messaging, chat } = chiefChat();
      messaging.addMessage(chat.id, {
        body: "The report",
        attachments: [{ name: "report.pdf", type: "application/pdf", bytes: new Uint8Array(2048) }],
      });
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      expect(transcript(page).textContent).toContain("report.pdf · 2 KB");
      expect(byText(page, "main ol button", "report.pdf")).toBeUndefined();
    });

    it("says just under 1 MB as 1 MB, as the Inbox does (HAL-17457)", async () => {
      const { messaging, chat } = chiefChat();
      messaging.addMessage(chat.id, {
        body: "The log",
        attachments: [{ name: "run.log", type: "text/plain", bytes: new Uint8Array(1_048_575) }],
      });
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      expect(transcript(page).textContent).toContain("run.log · 1 MB");
    });

    it("lists the box's files on their own row, whole names that wrap, each with Remove", async () => {
      const { messaging } = chiefChat();
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      const name = "quarterly-report-for-the-whole-acme-board-final-final.pdf";
      await attach(page, [new File(["x"], name, { type: "application/pdf" })]);
      const chip = [...page.querySelectorAll("main li")].find((li) =>
        li.textContent?.includes(name),
      );
      expect(chip?.textContent).toBe(`${name} · 1 byte`);
      expect(chip?.innerHTML).not.toContain("truncate");
      // The list isn't in the box with Attach a file, nor in Ask for an update's row, so neither moves.
      const attachButton = page.querySelector('main button[aria-label="Attach a file"]');
      expect(attachButton?.parentElement?.contains(chip ?? null)).toBe(false);
      const remove = chip?.querySelector("button");
      expect(remove?.getAttribute("aria-label")).toBe(`Remove ${name}`);
      await press(remove);
      expect(page.querySelector("main ul")).toBeNull();
      expect(page.textContent).toContain(`${name} removed.`);
    });

    it("after Remove focuses the next file's Remove, else the one before, else Attach a file", async () => {
      const { messaging } = chiefChat();
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      await attach(
        page,
        ["a.txt", "b.txt", "c.txt"].map((name) => new File(["x"], name, { type: "text/plain" })),
      );
      const removeOf = (name: string) => page.querySelector(`button[aria-label="Remove ${name}"]`);
      await press(removeOf("a.txt"));
      expect(document.activeElement).toBe(removeOf("b.txt"));
      expect(page.textContent).toContain("a.txt removed.");
      await press(removeOf("c.txt"));
      expect(document.activeElement).toBe(removeOf("b.txt"));
      await press(removeOf("b.txt"));
      expect(document.activeElement).toBe(
        page.querySelector('main button[aria-label="Attach a file"]'),
      );
      expect(page.textContent).toContain("b.txt removed.");
    });

    it("offline, keeps saying why Send won't work after a file is removed (HAL-18316 MS7)", async () => {
      const { messaging, acme } = chiefChat();
      messaging.goOffline(acme.id);
      const page = await openMessenger(messaging);
      await openChat(page, "Chief");
      await attach(page, [new File(["x"], "notes.txt", { type: "text/plain" })]);
      await press(page.querySelector('button[aria-label="Remove notes.txt"]'));
      expect(page.textContent).toContain("Paperclip · Acme is offline. Your message stays here");
      expect(page.textContent).not.toContain("notes.txt removed.");
    });

    it("shows a message's files by their names while it is Sending…", async () => {
      const { messaging } = chiefChat();
      vi.spyOn(messaging, "send").mockReturnValue(new Promise(() => undefined));
      const page = await openMessenger(messaging);
      const box = await openChat(page, "Chief");
      await attach(page, [new File(["x"], "notes.txt", { type: "text/plain" })]);
      await typeAndSend(box, "Here");
      expect(page.querySelector("[data-pending]")?.textContent).toBe("You: Herenotes.txtSending…");
    });
  });
});
