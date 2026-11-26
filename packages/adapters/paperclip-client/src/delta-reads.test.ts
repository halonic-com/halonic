import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { company, testKey } from "./acme-data.test-helper.ts";
import { FakePaperclip, type SeenRequest } from "./fake-paperclip.test-helper.ts";
import { text } from "./json.ts";
import { PaperclipReader } from "./reader.ts";
import { PaperclipTaskList } from "./task-list.ts";
import { PaperclipTransport } from "./transport.ts";

interface FakeTask {
  id: string;
  status: string;
  updatedAt: string;
  description?: string | null;
}

const tasksPath = `/api/companies/${company}/issues`;
const before = "2026-11-24T10:00:00.000Z";
const after = "2026-11-24T10:05:00.000Z";

/** Task `n`'s ID; they sort in the order of `n`, as Paperclip's ID order does. */
const taskId = (n: number): string => `i0000000-0000-4000-8000-00000000010${n}`;

let paperclip: FakePaperclip;
let tasks: FakeTask[];
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
    .slice(0, Number(query.get("limit")))
    .map((task) => (query.get("view") === "index" ? { ...task, description: null } : task));
  answered.push(page.map((task) => task.id));
  return page;
}

beforeEach(() => {
  tasks = [];
  answered = [];
  paperclip = new FakePaperclip().on("GET", tasksPath, (request) => ({ body: listTasks(request) }));
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

const open = (...numbers: number[]): FakeTask[] =>
  numbers.map((n) => ({ id: taskId(n), status: "todo", updatedAt: before }));

verifies("paperclip-client.delta-reads", () => {
  describe("the task list", () => {
    it("drops a task that closes after the first load, after one delta read", async () => {
      tasks = open(1, 2);
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
      tasks = open(1, 2, 3, 4, 5);
      const list = new PaperclipTaskList(reader(), company, { pageSize: 2 });
      await list.read();
      answered = [];

      tasks = tasks.map((task) => ({ ...task, updatedAt: after }));
      const read = await list.read();

      expect(answered).toEqual([[taskId(1), taskId(2)], [taskId(3), taskId(4)], [taskId(5)]]);
      expect(answered.flat()).toHaveLength(new Set(answered.flat()).size);
      expect(ids(read)).toHaveLength(5);
    });

    it("takes the watermark from the first page, so a change behind the cursor isn't lost", async () => {
      tasks = open(1, 2, 3);
      const list = new PaperclipTaskList(reader(), company, { pageSize: 2 });
      paperclip.on("GET", tasksPath, (request) => {
        if (request.query.has("afterId")) {
          tasks[0] = { id: taskId(1), status: "done", updatedAt: "2026-11-24T10:01:00.000Z" };
          tasks[2] = { id: taskId(3), status: "todo", updatedAt: "2026-11-24T10:02:00.000Z" };
        }
        return { body: listTasks(request) };
      });
      expect(ids(await list.read())).toEqual([taskId(1), taskId(2), taskId(3)]);

      paperclip.on("GET", tasksPath, (request) => ({ body: listTasks(request) }));
      expect(ids(await list.read())).toEqual([taskId(2), taskId(3)]);
    });

    it("after a failed page, starts the next read after the last task it read", async () => {
      tasks = open(1, 2, 3);
      const list = new PaperclipTaskList(reader(), company, { pageSize: 2 });
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
      tasks = open(1);
      const list = new PaperclipTaskList(reader(), company);
      await list.read();
      const first = paperclip.seen.length;

      expect(ids(await list.read())).toEqual([taskId(1)]);

      expect(paperclip.seen.length - first).toBe(1);
    });

    it("loads the open tasks whole once in 10 reads, so a deleted task leaves", async () => {
      tasks = open(1, 2);
      const list = new PaperclipTaskList(reader(), company);
      await list.read();
      tasks = open(1);
      for (let delta = 0; delta < 9; delta += 1) {
        expect(ids(await list.read())).toEqual([taskId(1), taskId(2)]);
      }

      expect(ids(await list.read())).toEqual([taskId(1)]);
      expect(paperclip.seen.at(-1)?.query.get("status")).not.toBeNull();
    });

    it("reads a task whole that needs its description, and again only when it changed", async () => {
      tasks = [...open(1), { id: taskId(2), status: "todo", updatedAt: before, description: "Hi" }];
      paperclip.on("GET", `/api/issues/${taskId(2)}`, () => ({ body: tasks[1] }));
      const list = new PaperclipTaskList(reader(), company, {
        readWhole: (task) => text(task, "id") === taskId(2),
      });

      const read = await list.read();
      tasks[0] = { id: taskId(1), status: "todo", updatedAt: after };
      await list.read();

      expect(read.map((task) => task["description"])).toEqual([null, "Hi"]);
      expect(paperclip.seen.filter((request) => request.path.endsWith(taskId(2)))).toHaveLength(1);
    });

    it("reads the open tasks plainly from a Paperclip that refuses view=index", async () => {
      tasks = open(1, 2);
      paperclip.on("GET", tasksPath, (request) =>
        request.query.has("view") ? { status: 400 } : { body: listTasks(request) },
      );
      const list = new PaperclipTaskList(reader(), company);

      expect(ids(await list.read())).toEqual([taskId(1), taskId(2)]);
      tasks = open(2);
      expect(ids(await list.read())).toEqual([taskId(2)]);
      expect(paperclip.seen.at(-1)?.query.get("view")).toBeNull();
    });

    it("throws instead of asking for the same page again", async () => {
      tasks = open(1, 2, 3);
      paperclip.on("GET", tasksPath, () => ({ body: open(1, 2) }));
      const list = new PaperclipTaskList(reader(), company, { pageSize: 2 });

      await expect(list.read()).rejects.toThrow("the same page again");
    });

    it("skips an updatedAt it can't read instead of keeping it as the watermark", async () => {
      tasks = [{ id: taskId(1), status: "todo", updatedAt: "not a time" }, ...open(2)];
      const list = new PaperclipTaskList(reader(), company);
      await list.read();

      expect(list.watermark().updatedAt).toBe(before);
      expect(ids(await list.read())).toEqual([taskId(1), taskId(2)]);
    });
  });
});
