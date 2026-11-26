import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { chatTask, testKey } from "./acme-data.test-helper.ts";
import { PaperclipCommentThreads } from "./comment-threads.ts";
import { FakePaperclip, type SeenRequest } from "./fake-paperclip.test-helper.ts";
import { text } from "./json.ts";
import { PaperclipReader } from "./reader.ts";
import { PaperclipTransport } from "./transport.ts";

interface FakeComment {
  id: string;
  body: string;
}

const commentsPath = `/api/issues/${chatTask}/comments`;

let paperclip: FakePaperclip;
let comments: FakeComment[];

/** The comments Paperclip answers `query` with: newest first, or after one, oldest first. */
function listComments({ query }: SeenRequest): FakeComment[] {
  const limit = Number(query.get("limit"));
  const anchor = query.get("after");
  if (anchor === null) {
    return comments.slice(-limit).reverse();
  }
  const index = comments.findIndex((comment) => comment.id === anchor);
  return index === -1 ? [] : comments.slice(index + 1, index + 1 + limit);
}

beforeEach(() => {
  comments = [
    { id: "m1", body: "Hello Ada" },
    { id: "m2", body: "Shall I go on?" },
  ];
  paperclip = new FakePaperclip().on("GET", commentsPath, (request) => ({
    body: listComments(request),
  }));
});

function threads(): PaperclipCommentThreads {
  const transport = new PaperclipTransport({
    address: paperclip.address,
    key: testKey,
    fetch: paperclip.fetch,
  });
  return new PaperclipCommentThreads(new PaperclipReader(transport, () => new Date()));
}

const ids = (list: readonly unknown[]): (string | undefined)[] =>
  list.map((comment) => text(comment as Record<string, unknown>, "id"));

verifies("paperclip-client.delta-reads", () => {
  describe("a chat's comments", () => {
    it("reads only the comments after the ones it keeps", async () => {
      const thread = threads();
      await thread.read(chatTask);

      comments.push({ id: "m3", body: "Yes" });
      const read = await thread.read(chatTask);

      expect(ids(read)).toEqual(["m1", "m2", "m3"]);
      const delta = paperclip.seen.at(-1)?.query;
      expect([delta?.get("after"), delta?.get("order")]).toEqual(["m1", "asc"]);
      expect(paperclip.seen).toHaveLength(2);
    });

    it("keeps the newest comment as Paperclip has it now, so a delete shows at once", async () => {
      const thread = threads();
      await thread.read(chatTask);

      comments[1] = { id: "m2", body: "" };
      const read = await thread.read(chatTask);

      expect(read.map((comment) => comment["body"])).toEqual(["Hello Ada", ""]);
      expect(paperclip.seen.at(-1)?.query.get("after")).toBe("m1");
    });

    it("reads the newest page whole when the newest comment it keeps is gone", async () => {
      const thread = threads();
      await thread.read(chatTask);

      comments = [{ id: "m1", body: "Hello Ada" }];
      const read = await thread.read(chatTask);

      expect(ids(read)).toEqual(["m1"]);
      expect(paperclip.seen.at(-1)?.query.get("after")).toBeNull();
    });

    it("reads the newest page whole once in 10 reads, so an older delete shows", async () => {
      const thread = threads();
      await thread.read(chatTask);
      for (let delta = 0; delta < 9; delta += 1) {
        await thread.read(chatTask);
        expect(paperclip.seen.at(-1)?.query.get("after")).toBe("m1");
      }

      comments[0] = { id: "m1", body: "" };
      const read = await thread.read(chatTask);

      expect(paperclip.seen.at(-1)?.query.get("after")).toBeNull();
      expect(read[0]?.["body"]).toBe("");
    });
  });
});
