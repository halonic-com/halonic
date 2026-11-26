import type { InboxItem } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import {
  approvalId,
  chatTask,
  confirmCard,
  plainTask,
  questionCard,
  testKey,
} from "./acme-data.test-helper.ts";
import { cardFileMaxBytes, cardFilesMax, typeOfBytes } from "./card-files.ts";
import type { PaperclipMessaging } from "./client.ts";
import {
  cardId as card,
  connect,
  type FakeAnswer,
  FakePaperclip,
  type Network,
  sourceId as source,
} from "./fake-paperclip.test-helper.ts";
import { findRequest } from "./requests.ts";

/** A 1×1 transparent PNG made for the tests. */
const png = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (character) => character.charCodeAt(0),
);

/** A made-up file record on task `task`, as Paperclip lists it. */
function file(id: string, name: string, type: string, createdAt: string, post: object) {
  return { id, originalFilename: name, contentType: type, byteSize: 120, createdAt, ...post };
}

// The question card is made at 09:59, the confirmation at 10:00 and the approval at 09:30.
const acmeFiles = () => [
  file("f-old", "old.png", "image/png", "2026-11-24T09:00:00.000Z", { issueCommentId: "c-old" }),
  file("f-light", "launch-light.png", "image/png", "2026-11-24T09:58:30.000Z", {
    issueCommentId: "c-new",
  }),
  file("f-dark", "launch-dark.png", "image/png", "2026-11-24T09:58:31.000Z", {
    issueCommentId: "c-new",
  }),
  file("f-spec", "spec.pdf", "application/pdf", "2026-11-24T09:59:30.000Z", {
    originatingRunId: "r-spec",
  }),
  // Made in the same instant as the confirmation, so after it.
  file("f-late", "notes.pdf", "application/pdf", "2026-11-24T10:00:00.000Z", {
    issueCommentId: "c-late",
  }),
];

let paperclip: FakePaperclip;
const network: Network = { offline: false };

beforeEach(() => {
  network.offline = false;
  paperclip = new FakePaperclip().serveAcme();
  paperclip.on("GET", `/api/issues/${plainTask}/attachments`, { body: acmeFiles() });
});

const client = () => connect(paperclip, network);
const fileId = (task: string, id: string) => `${source}:attachment:${task}:${id}`;
const filesRoute = (task: string) => `GET /api/issues/${task}/attachments`;
const seenRoutes = () => paperclip.seen.map((request) => `${request.method} ${request.path}`);

function namesOn(items: readonly InboxItem[], id: string): string[] | undefined {
  return items.find((item) => item.id === id)?.attachments.map((attachment) => attachment.name);
}

/** A client that has listed the Inbox, so its cards' files may be read. */
async function listed(): Promise<PaperclipMessaging> {
  const messaging = client();
  await messaging.listInboxItems();
  paperclip.seen.length = 0;
  return messaging;
}

function serveContent(answer: FakeAnswer, id = "f-light"): void {
  paperclip.on("GET", `/api/attachments/${id}/content`, answer);
}

verifies("paperclip-client.card-files", () => {
  describe("the files on a card", () => {
    it("are the pictures of the newest post before the card, oldest first", async () => {
      const items = await client().listInboxItems();
      expect(namesOn(items, card(plainTask, questionCard))).toEqual([
        "launch-light.png",
        "launch-dark.png",
      ]);
      const [light] =
        items.find((item) => item.id === card(plainTask, questionCard))?.attachments ?? [];
      expect(light).toEqual({
        id: fileId(plainTask, "f-light"),
        name: "launch-light.png",
        type: "image/png",
        size: 120,
      });
    });

    it("are a run's file when it has no comment, never one made with or after the card", async () => {
      const items = await client().listInboxItems();
      expect(namesOn(items, card(plainTask, confirmCard))).toEqual(["spec.pdf"]);
    });

    it("are none when nothing was posted before the card, or the task has no file list", async () => {
      paperclip.on("GET", `/api/issues/${plainTask}/attachments`, {
        body: acmeFiles().filter((each) => each.id === "f-late"),
      });
      const items = await client().listInboxItems();
      expect(namesOn(items, card(plainTask, confirmCard))).toEqual([]);
      expect(namesOn(items, card(plainTask, questionCard))).toEqual([]);
      paperclip.routes.delete(filesRoute(plainTask));
      const again = await client().listInboxItems();
      expect(namesOn(again, card(plainTask, confirmCard))).toEqual([]);
    });

    it(`are at most ${cardFilesMax}`, async () => {
      const many = Array.from({ length: cardFilesMax + 5 }, (_, index) =>
        file(`f-${index}`, `${index}.png`, "image/png", "2026-11-24T09:58:00.000Z", {
          issueCommentId: "c-many",
        }),
      );
      paperclip.on("GET", `/api/issues/${plainTask}/attachments`, { body: many });
      const items = await client().listInboxItems();
      expect(namesOn(items, card(plainTask, confirmCard))).toHaveLength(cardFilesMax);
    });

    it("are an approval's from its first linked task, read once while it waits", async () => {
      const messaging = client();
      const items = await messaging.listInboxItems();
      expect(namesOn(items, `${source}:approval:${approvalId}`)).toEqual(["old.png"]);
      paperclip.seen.length = 0;
      const again = await messaging.listInboxItems();
      expect(namesOn(again, `${source}:approval:${approvalId}`)).toEqual(["old.png"]);
      expect(seenRoutes().filter((route) => route.endsWith("/attachments"))).toEqual([]);
    });

    it("are read only for a task with a card for the person, and fail the list on a fault", async () => {
      await client().listInboxItems();
      expect(seenRoutes()).not.toContain(filesRoute(chatTask));
      paperclip.on("GET", `/api/issues/${plainTask}/attachments`, { status: 500 });
      await expect(client().listInboxItems()).rejects.toThrow(/listTaskAttachments/);
    });
  });

  describe("reading a card's file", () => {
    it("reads a listed picture on the connection's own host, with its key", async () => {
      const messaging = await listed();
      serveContent({ body: png, headers: { "content-type": "image/png" } });
      expect(await messaging.readAttachment(fileId(plainTask, "f-light"))).toEqual({
        outcome: "read",
        bytes: png,
        type: "image/png",
      });
      const [request] = paperclip.seen;
      expect(request?.path).toBe("/api/attachments/f-light/content");
      expect(request?.headers.get("authorization")).toBe(`Bearer ${testKey}`);
      expect(findRequest("GET", request?.path ?? "")).toBe("readAttachmentContent");
    });

    it("refuses another type, or bytes that don't start as the stated type", async () => {
      const messaging = await listed();
      const unsupported = { outcome: "refused", reason: "unsupported-type" };
      for (const type of ["image/svg+xml", "text/html", "application/pdf"]) {
        serveContent({ body: png, headers: { "content-type": type } });
        expect(await messaging.readAttachment(fileId(plainTask, "f-light"))).toEqual(unsupported);
      }
      const html = new TextEncoder().encode("<html><script></script></html>");
      serveContent({ body: html, headers: { "content-type": "image/png" } });
      expect(await messaging.readAttachment(fileId(plainTask, "f-light"))).toEqual(unsupported);
      serveContent({ body: png, headers: { "content-type": "image/gif" } });
      expect(await messaging.readAttachment(fileId(plainTask, "f-light"))).toEqual(unsupported);
    });

    it("refuses over 10 MB, by its stated length or by the bytes that came", async () => {
      const messaging = await listed();
      const tooLarge = { outcome: "refused", reason: "too-large" };
      const length = String(cardFileMaxBytes + 1);
      serveContent({
        body: png,
        headers: { "content-type": "image/png", "content-length": length },
      });
      expect(await messaging.readAttachment(fileId(plainTask, "f-light"))).toEqual(tooLarge);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(png);
          controller.enqueue(new Uint8Array(cardFileMaxBytes));
          controller.close();
        },
      });
      serveContent({ body: stream, headers: { "content-type": "image/png" } });
      expect(await messaging.readAttachment(fileId(plainTask, "f-light"))).toEqual(tooLarge);
    });

    it("refuses when offline, signed out or gone, and a redirect throws", async () => {
      const messaging = await listed();
      const id = fileId(plainTask, "f-light");
      expect(await messaging.readAttachment(id)).toMatchObject({ reason: "not-found" });
      serveContent({ status: 401 });
      expect(await messaging.readAttachment(id)).toMatchObject({ reason: "signed-out" });
      network.offline = true;
      expect(await messaging.readAttachment(id)).toMatchObject({ reason: "offline" });
      network.offline = false;
      serveContent({ status: 302, headers: { location: "https://elsewhere.example/a.png" } });
      await expect(messaging.readAttachment(id)).rejects.toThrow(/redirect/);
    });

    it("never reads an ID it didn't list, one naming another task, or an unsafe one", async () => {
      const messaging = await listed();
      for (const id of [
        fileId(plainTask, "f-never"),
        fileId(plainTask, "f-late"),
        fileId(chatTask, "f-light"),
        fileId(plainTask, ".."),
        `${source}:attachment:${plainTask}:a%2Fb`,
        "paperclip:other:attachment:i:f-light",
      ]) {
        expect(await messaging.readAttachment(id)).toEqual({
          outcome: "refused",
          reason: "not-found",
        });
      }
      // Before any list, not even a file a card will show is read.
      expect(await client().readAttachment(fileId(plainTask, "f-light"))).toMatchObject({
        reason: "not-found",
      });
      expect(paperclip.seen).toEqual([]);
    });
  });

  it("tells a picture's type by its leading bytes", () => {
    const ascii = (word: string) => Uint8Array.from(word, (character) => character.charCodeAt(0));
    expect(typeOfBytes(png)).toBe("image/png");
    expect(typeOfBytes(Uint8Array.of(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(typeOfBytes(ascii("GIF89a..."))).toBe("image/gif");
    expect(typeOfBytes(ascii("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(typeOfBytes(ascii("RIFF\0\0\0\0WAVE"))).toBeUndefined();
    expect(typeOfBytes(new Uint8Array())).toBeUndefined();
  });
});
