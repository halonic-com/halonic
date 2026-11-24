// @vitest-environment jsdom
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { byText, openChat, openMessenger, press, typeAndSend } from "../test-support/page.tsx";
import { unmountAll } from "../test-support/render.tsx";

/** The picture decoder and canvas jsdom lacks; the test only checks what was drawn and from what. */
const drawn: unknown[] = [];

beforeEach(() => {
  vi.stubGlobal("createImageBitmap", (blob: Blob) =>
    Promise.resolve({ width: 2, height: 1, close: () => {}, blob }),
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: (picture: unknown) => drawn.push(picture),
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
      expect(transcript(page).textContent).toContain("report.pdf 2 KB");
      expect(byText(page, "main ol button", "report.pdf")).toBeUndefined();
    });
  });
});
