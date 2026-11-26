import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { chatTask, company, testKey } from "./acme-data.test-helper.ts";
import { PaperclipCommentThreads } from "./comment-threads.ts";
import { FakePaperclip, type SeenRequest } from "./fake-paperclip.test-helper.ts";
import { text } from "./json.ts";
import { PaperclipReader } from "./reader.ts";
import { PaperclipTaskList } from "./task-list.ts";
import { PaperclipTransport } from "./transport.ts";

interface FakeTask {
  id: string;
  status: string;
  updatedAt: string;
}

interface FakeComment {
  id: string;
  body: string;
}

const tasksPath = `/api/companies/${company}/issues`;
const commentsPath = `/api/issues/${chatTask}/comments`;
const before = "2026-11-24T10:00:00.000Z";
const after = "2026-11-24T10:05:00.000Z";

/** Task `n`'s ID; they sort in the order of `n`, as Paperclip's ID order does. */
const taskId = (n: number): string => `i0000000-0000-4000-8000-00000000010${n}`;

let paperclip: FakePaperclip;
let tasks: FakeTask[];
let comments: FakeComment[];
/** The task IDs each task read answered with. */
let answered: string[][];

/** The tasks Paperclip's list answers `query` with: its filters, ID order and page. */
function listTasks({ query }: SeenRequest): FakeTask[] {
  const status = query.get("status");
  const since = query.get("updatedSince");
  const afterId = query.get("afterId");
  const page = tasks
    .filter((task) => status === null || status.split(",").includes(task.status))
    .filter((task) => since === null || Date.parse(task.updatedAt) > Date.parse(since))
    .filter((task) => afterId === null || task.id > afterId)
    .sort((left, right) => left.id.localeCompare(right.id))
    .slice(0, Number(query.get("limit")));
  answered.push(page.map((task) => task.id));
  return page;
}

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
  tasks = [];
  comments = [];
  answered = [];
  paperclip = new FakePaperclip()
    .on("GET", tasksPath, (request) => ({ body: listTasks(request) }))
    .on("GET", commentsPath, (request) => ({ body: listComments(request) }));
});

function reader(): PaperclipReader {
  const transport = new PaperclipTransport({
    address: paperclip.address,
    key: testKey,
    fetch: paperclip.fetch,
  });
  return new PaperclipReader(transport, () => new Date(after));
}

const ids = (list: readonly unknown[]): (string | undefined)[] =>
  list.map((task) => text(task as Record<string, unknown>, "id"));

verifies("paperclip-client.delta-reads", () => {
  describe("the task list", () => {
    it("drops a task that closes after the first load, after one delta read", async () => {
      tasks = [
        { id: taskId(1), status: "todo", updatedAt: before },
        { id: taskId(2), status: "in_progress", updatedAt: before },
      ];
      const list = new PaperclipTaskList(reader(), company);
      expect(ids(await list.read())).toEqual([taskId(1), taskId(2)]);

      tasks[0] = { id: taskId(1), status: "done", updatedAt: after };
      const read = await list.read();

      expect(ids(read)).toEqual([taskId(2)]);
      const delta = paperclip.seen.at(-1)?.query;
      expect(delta?.get("status")).toBeNull();
      expect(delta?.get("view")).toBe("index");
      expect(delta?.get("updatedSince")).toBe("2026-11-24T09:59:30.000Z");
      expect(list.watermark()).toEqual({ updatedAt: after, afterId: undefined });
    });

    it("reads a page boundary inside equal updatedAt values in one pass, each task once", async () => {
      tasks = [1, 2, 3, 4, 5].map((n) => ({ id: taskId(n), status: "todo", updatedAt: before }));
      const list = new PaperclipTaskList(reader(), company, 2);
      await list.read();
      answered = [];

      tasks = tasks.map((task) => ({ ...task, updatedAt: after }));
      const read = await list.read();

      expect(answered).toEqual([[taskId(1), taskId(2)], [taskId(3), taskId(4)], [taskId(5)]]);
      expect(answered.flat()).toHaveLength(new Set(answered.flat()).size);
      expect(ids(read)).toHaveLength(5);
    });

    it("after a failed page, starts the next read after the last task it read", async () => {
      tasks = [1, 2, 3].map((n) => ({ id: taskId(n), status: "todo", updatedAt: before }));
      const list = new PaperclipTaskList(reader(), company, 2);
      paperclip.on("GET", tasksPath, (request) =>
        request.query.has("afterId") ? { status: 500 } : { body: listTasks(request) },
      );
      await expect(list.read()).rejects.toThrow();
      expect(list.watermark()).toEqual({ updatedAt: undefined, afterId: taskId(2) });

      paperclip.on("GET", tasksPath, (request) => ({ body: listTasks(request) }));
      const read = await list.read();

      expect(paperclip.seen.at(-1)?.query.get("afterId")).toBe(taskId(2));
      expect(ids(read)).toEqual([taskId(1), taskId(2), taskId(3)]);
    });

    it("makes exactly one request for a read where nothing changed", async () => {
      tasks = [{ id: taskId(1), status: "todo", updatedAt: before }];
      const list = new PaperclipTaskList(reader(), company);
      await list.read();
      const first = paperclip.seen.length;

      expect(ids(await list.read())).toEqual([taskId(1)]);

      expect(paperclip.seen.length - first).toBe(1);
    });
  });

  describe("a chat's comments", () => {
    it("reads only the comments after the ones it keeps", async () => {
      comments = [
        { id: "m1", body: "Hello Ada" },
        { id: "m2", body: "Shall I go on?" },
      ];
      const threads = new PaperclipCommentThreads(reader());
      await threads.read(chatTask);

      comments.push({ id: "m3", body: "Yes" });
      const read = await threads.read(chatTask);

      expect(ids(read)).toEqual(["m1", "m2", "m3"]);
      const delta = paperclip.seen.at(-1)?.query;
      expect([delta?.get("after"), delta?.get("order")]).toEqual(["m1", "asc"]);
      expect(paperclip.seen).toHaveLength(2);
    });

    it("reads the newest page whole when the newest comment it keeps was deleted", async () => {
      comments = [
        { id: "m1", body: "Hello Ada" },
        { id: "m2", body: "Shall I go on?" },
      ];
      const threads = new PaperclipCommentThreads(reader());
      await threads.read(chatTask);

      comments = [{ id: "m1", body: "Hello Ada" }];
      const read = await threads.read(chatTask);

      expect(ids(read)).toEqual(["m1"]);
      expect(paperclip.seen.at(-1)?.query.get("after")).toBeNull();
    });
  });
});
