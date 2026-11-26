// @vitest-environment jsdom

import type { MessagingAuthor } from "@halonicjs/ports";
import { FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act, StrictMode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { fakeRuns } from "../fake-runs.test-helper.ts";
import { Inbox } from "../inbox.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { attachmentLine, maxImageBytes, maxImagePixels } from "./agent-attachments.tsx";
import { InboxView } from "./inbox-page.tsx";

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Local times, so the test reads the same in every time zone. Tue 24 Nov 2026.
const tenOClock = new Date(2026, 10, 24, 10, 0);
const noon = new Date(2026, 10, 24, 12, 0);
const oneOClock = new Date(2026, 10, 24, 13, 0);

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** A fake with the source "Paperclip · Acme" whose clock the test sets, with Chief and Ravi in it. */
function acme() {
  let now = tenOClock;
  const messaging = new FakeAgentMessaging({ now: () => now });
  const source = messaging.addSource({ label: "Paperclip · Acme", provider: "paperclip" });
  const author = (name: string): MessagingAuthor => {
    const agent = messaging.addAgent(source.id, { name });
    return { kind: "agent", agent: agent.id, name };
  };
  return {
    messaging,
    source,
    chief: author("Chief"),
    ravi: author("Ravi"),
    at: (time: Date) => (now = time),
  };
}

/** The Inbox with no runs waiting and the agents' items from `messaging`, at 13:00. */
async function openInbox(messaging: FakeAgentMessaging) {
  const inbox = new Inbox(fakeRuns([]).runs);
  // Strict mode, as Studio renders every page: the picture's effect runs twice.
  const root = render(
    <StrictMode>
      <InboxView inbox={inbox} now={() => oneOClock} agentMessaging={messaging} />
    </StrictMode>,
  );
  await settled();
  return root;
}

function rows(root: HTMLElement): HTMLTableRowElement[] {
  return [...root.querySelectorAll<HTMLTableRowElement>('[role="grid"] tr')];
}

function buttons(root: HTMLElement, name: string): HTMLButtonElement[] {
  return [...root.querySelectorAll("button")].filter((b) => b.textContent?.startsWith(name));
}

async function click(target: HTMLElement | undefined) {
  if (target === undefined) throw new Error("nothing to click");
  await act(async () => {
    target.click();
  });
  await settled();
}

async function openFirstRow(root: HTMLElement) {
  await click(rows(root)[0]?.querySelector<HTMLElement>('[role="gridcell"]') ?? undefined);
}

verifies("inbox.agent-item-bundles", () => {
  it("bundles two cards from one agent in one row with the oldest one's waiting time", async () => {
    const { messaging, source, chief, at } = acme();
    messaging.addInboxItem(source.id, { question: "Ship the release?", from: chief });
    at(noon);
    messaging.addInboxItem(source.id, { question: "Merge the fix?", from: chief });
    const root = await openInbox(messaging);

    expect(rows(root)).toHaveLength(1);
    expect(rows(root)[0]?.textContent).toContain("2 cards from Chief");
    // The oldest asked at 10:00, so the bundle has waited 3 h, not the newest's 1 h.
    expect(rows(root)[0]?.textContent).toContain("Paperclip · Acme · Chief · Waiting 3 h");
    expect(root.textContent).toContain("2 waiting");
  });

  it("opens a bundle as one card per item, oldest first, each answered on its own", async () => {
    const { messaging, source, chief, at } = acme();
    const first = messaging.addInboxItem(source.id, { question: "Ship the release?", from: chief });
    at(noon);
    messaging.addInboxItem(source.id, { question: "Merge the fix?", from: chief });
    const answer = vi.spyOn(messaging, "answer");
    const root = await openInbox(messaging);
    await openFirstRow(root);

    const titles = [...root.querySelectorAll("section h2")].map((h) => h.textContent);
    expect(titles).toEqual(["Ship the release?", "Merge the fix?"]);
    expect(document.activeElement?.textContent).toBe("Ship the release?");
    await click(buttons(root, "Yes")[0]);
    expect(answer).toHaveBeenCalledWith(first.id, { kind: "option", option: "yes" });
    expect(root.querySelectorAll("section")).toHaveLength(2);
    expect(root.querySelector("section")?.textContent).toContain("Answered at 12:00: Yes.");
    expect(rows(root).map((row) => row.textContent)).toEqual([
      expect.stringContaining("Merge the fix?"),
    ]);
  });

  it("bundles two agents' cards on one task under that task, and keeps other agents' apart", async () => {
    const { messaging, source, chief, ravi, at } = acme();
    const task = messaging.addWork(source.id, { label: "ACME-12", title: "Fix the login" });
    messaging.addInboxItem(source.id, {
      question: "Approve the plan?",
      from: chief,
      work: task.id,
    });
    at(noon);
    messaging.addInboxItem(source.id, { question: "Use the new API?", from: ravi, work: task.id });
    messaging.addInboxItem(source.id, { question: "Hire Ana?", from: ravi });
    const root = await openInbox(messaging);

    expect(rows(root).map((row) => row.textContent)).toEqual([
      expect.stringContaining("Hire Ana?"),
      expect.stringContaining("2 cards on ACME-12 · Fix the login"),
    ]);
    expect(rows(root)[1]?.textContent).toContain("Paperclip · Acme · Chief, Ravi · Waiting 3 h");
  });

  it("names no single agent on a bundle of several agents' cards whose work it can't find", async () => {
    const { messaging, source, chief, ravi } = acme();
    messaging.addInboxItem(source.id, { question: "Approve?", from: chief, work: "gone-task" });
    messaging.addInboxItem(source.id, { question: "Use it?", from: ravi, work: "gone-task" });
    const root = await openInbox(messaging);

    expect(rows(root)).toHaveLength(1);
    expect(rows(root)[0]?.textContent).toContain("2 cards");
    expect(rows(root)[0]?.textContent).not.toContain("2 cards from");
  });

  it("keeps the open bundle's row highlighted when it shrinks to one card", async () => {
    const { messaging, source, chief, at } = acme();
    messaging.addInboxItem(source.id, { question: "Ship the release?", from: chief });
    at(noon);
    messaging.addInboxItem(source.id, { question: "Merge the fix?", from: chief });
    const root = await openInbox(messaging);
    await openFirstRow(root);
    expect(rows(root)[0]?.getAttribute("aria-current")).toBe("true");

    await click(buttons(root, "Yes")[0]);
    expect(rows(root)).toHaveLength(1);
    expect(rows(root)[0]?.textContent).toContain("Merge the fix?");
    expect(rows(root)[0]?.getAttribute("aria-current")).toBe("true");
  });
});

/**
 * Draws nothing for real: jsdom has no image decoder or canvas, so the test plays both. A closed
 * picture refuses to be drawn, as a browser's does.
 */
function fakePictures(size = { width: 40, height: 30 }) {
  const picture = { ...size, closed: false, close: vi.fn() };
  picture.close.mockImplementation(() => {
    picture.closed = true;
  });
  const decode = vi.fn(async (_blob: Blob) => picture);
  vi.stubGlobal("createImageBitmap", decode);
  const drawImage = vi.fn((drawn: { readonly closed: boolean }) => {
    if (drawn.closed) throw new Error("The picture was closed before it was drawn.");
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  return { decode, drawImage, picture };
}

const screenshot = { name: "login.png", type: "image/png", bytes: new Uint8Array([1, 2, 3]) };

verifies("inbox.agent-item-media", () => {
  it("lists an image on a card and reads nothing until the person asks to see it", async () => {
    const { decode, drawImage, picture } = fakePictures();
    const fetch = vi.spyOn(globalThis, "fetch");
    const { messaging, source, chief } = acme();
    const item = messaging.addInboxItem(source.id, {
      question: "Does the login look right?",
      from: chief,
      files: [screenshot],
    });
    const read = vi.spyOn(messaging, "readAttachment");
    const root = await openInbox(messaging);
    await openFirstRow(root);

    expect(root.querySelector("section")?.textContent).toContain("login.png · 3 bytes");
    expect(read).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
    expect(root.querySelector("canvas, img, [src]")).toBeNull();

    await click(buttons(root, "Show image")[0]);
    expect(read).toHaveBeenCalledWith(item.attachments[0]?.id);
    expect(decode.mock.calls[0]?.[0].type).toBe("image/png");
    const shown = root.querySelector('canvas[role="img"]');
    expect(shown?.getAttribute("aria-label")).toBe("login.png");
    expect(drawImage).toHaveBeenCalledTimes(1);
    expect(drawImage).toHaveBeenCalledWith(picture, 0, 0);
    expect(buttons(root, "Show image")).toHaveLength(0);
    // The button is gone, so focus moves to the picture rather than falling to the page.
    expect(document.activeElement).toBe(shown);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("says an image couldn't load, and reads it again on Try again", async () => {
    fakePictures();
    const { messaging, source, chief } = acme();
    messaging.addInboxItem(source.id, { question: "Look?", from: chief, files: [screenshot] });
    const read = vi
      .spyOn(messaging, "readAttachment")
      .mockResolvedValueOnce({ outcome: "refused", reason: "offline" });
    const root = await openInbox(messaging);
    await openFirstRow(root);

    await click(buttons(root, "Show image")[0]);
    expect(root.textContent).toContain("Couldn't load the image.");
    expect(root.querySelector("canvas")).toBeNull();
    await click(buttons(root, "Try again")[0]);
    expect(read).toHaveBeenCalledTimes(2);
    expect(root.querySelector('canvas[role="img"]')).not.toBeNull();
  });

  it("lists an SVG file by name and size and offers no way to draw it", async () => {
    const { decode } = fakePictures();
    const { messaging, source, chief } = acme();
    const drawing = { name: "chart.svg", type: "image/svg+xml", bytes: new Uint8Array(2048) };
    messaging.addInboxItem(source.id, { question: "Chart ok?", from: chief, files: [drawing] });
    const root = await openInbox(messaging);
    await openFirstRow(root);

    expect(root.querySelector("section")?.textContent).toContain("chart.svg · 2 KB");
    expect(buttons(root, "Show image")).toHaveLength(0);
    expect(decode).not.toHaveBeenCalled();
  });

  it("closes a shown picture only when its card goes, so strict mode still draws it", async () => {
    const { drawImage, picture } = fakePictures();
    const { messaging, source, chief } = acme();
    messaging.addInboxItem(source.id, { question: "Look?", from: chief, files: [screenshot] });
    const root = await openInbox(messaging);
    await openFirstRow(root);

    await click(buttons(root, "Show image")[0]);
    expect(drawImage).toHaveBeenCalledWith(picture, 0, 0);
    expect(picture.close).not.toHaveBeenCalled();
    unmountAll();
    expect(picture.close).toHaveBeenCalledTimes(1);
  });

  it("never decodes an image whose read gives a type it doesn't draw", async () => {
    const { decode } = fakePictures();
    const { messaging, source, chief } = acme();
    messaging.addInboxItem(source.id, { question: "Look?", from: chief, files: [screenshot] });
    vi.spyOn(messaging, "readAttachment").mockResolvedValue({
      outcome: "read",
      bytes: new Uint8Array([60, 115, 118, 103]),
      type: "image/svg+xml",
    });
    const root = await openInbox(messaging);
    await openFirstRow(root);

    await click(buttons(root, "Show image")[0]);
    expect(decode).not.toHaveBeenCalled();
    expect(root.textContent).toContain("Couldn't load the image.");
    expect(root.querySelector("canvas")).toBeNull();
  });

  it("never reads or decodes an image listed above the size limit", async () => {
    const { decode } = fakePictures();
    const { messaging, source, chief } = acme();
    const huge = { ...screenshot, bytes: new Uint8Array(maxImageBytes + 1) };
    messaging.addInboxItem(source.id, { question: "Look?", from: chief, files: [huge] });
    const read = vi.spyOn(messaging, "readAttachment");
    const root = await openInbox(messaging);
    await openFirstRow(root);

    await click(buttons(root, "Show image")[0]);
    expect(read).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
    expect(root.textContent).toContain("Couldn't load the image.");
  });

  it("never decodes an image whose read is above the size limit, whatever size it listed", async () => {
    const { decode } = fakePictures();
    const { messaging, source, chief } = acme();
    messaging.addInboxItem(source.id, { question: "Look?", from: chief, files: [screenshot] });
    vi.spyOn(messaging, "readAttachment").mockResolvedValue({
      outcome: "read",
      bytes: new Uint8Array(maxImageBytes + 1),
      type: "image/png",
    });
    const root = await openInbox(messaging);
    await openFirstRow(root);

    await click(buttons(root, "Show image")[0]);
    expect(decode).not.toHaveBeenCalled();
    expect(root.textContent).toContain("Couldn't load the image.");
  });

  it("never draws a picture that decodes above the pixel limit, and closes it", async () => {
    const { decode, drawImage, picture } = fakePictures({ width: maxImagePixels, height: 2 });
    const { messaging, source, chief } = acme();
    messaging.addInboxItem(source.id, { question: "Look?", from: chief, files: [screenshot] });
    const root = await openInbox(messaging);
    await openFirstRow(root);

    await click(buttons(root, "Show image")[0]);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(drawImage).not.toHaveBeenCalled();
    expect(picture.close).toHaveBeenCalledTimes(1);
    expect(root.textContent).toContain("Couldn't load the image.");
    expect(root.querySelector("canvas")).toBeNull();
  });

  it("says a file's size in words that read right at every edge (HAL-17457)", () => {
    const line = (size: number) => attachmentLine({ id: "a1", name: "f.png", type: "", size });
    expect(line(1)).toBe("f.png · 1 byte");
    expect(line(512)).toBe("f.png · 512 bytes");
    expect(line(120 * 1024)).toBe("f.png · 120 KB");
    expect(line(1_048_064)).toBe("f.png · 1 MB");
    expect(line(2 * 1024 * 1024)).toBe("f.png · 2 MB");
    expect(line(1.2 * 1024 * 1024)).toBe("f.png · 1.2 MB");
  });

  it("names each picture's button after its file, so two of them sound apart", async () => {
    fakePictures();
    const { messaging, source, chief } = acme();
    const before = { ...screenshot, name: "before.png" };
    messaging.addInboxItem(source.id, {
      question: "Which?",
      from: chief,
      files: [screenshot, before],
    });
    vi.spyOn(messaging, "readAttachment").mockResolvedValueOnce({
      outcome: "refused",
      reason: "offline",
    });
    const root = await openInbox(messaging);
    await openFirstRow(root);

    const names = () => buttons(root, "").map((button) => button.getAttribute("aria-label"));
    expect(names()).toContain("Show image: login.png");
    expect(names()).toContain("Show image: before.png");
    await click(buttons(root, "Show image")[0]);
    expect(names()).toContain("Try again: login.png");
  });
});
