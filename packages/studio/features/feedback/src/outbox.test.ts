import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  FeedbackOutbox,
  type FeedbackStore,
  maxWaiting,
  maxWaitingBytes,
  type OutboxLock,
  type OutboxParts,
  outboxLockName,
  pageOutboxLock,
  type SendOutcome,
  type WaitingFeedback,
  webOutboxLock,
} from "./outbox.ts";
import type { FeedbackTask } from "./payload.ts";

function task(title: string): FeedbackTask {
  return {
    title,
    description: title,
    project: "Halonic apps",
    assignee: "Chief",
    screenshot: null,
  };
}

/**
 * A store kept in memory, as Studio's IndexedDB one is: one entry per feedback, by its ID, with
 * its screenshot. It lists newest first, so a test sees the outbox sort by when each was kept.
 */
class MemoryStore implements FeedbackStore {
  readonly entries = new Map<string, WaitingFeedback>();
  readonly images = new Map<string, Uint8Array>();
  /** The waiting feedback's titles, oldest first. */
  get titles(): string[] {
    return [...this.entries.values()].map((each) => each.task.title);
  }
  async list() {
    return [...this.entries.values()].reverse();
  }
  async add(feedback: WaitingFeedback, image: Uint8Array | null) {
    this.entries.set(feedback.id, feedback);
    if (image !== null) this.images.set(feedback.id, image);
  }
  async update(feedback: WaitingFeedback) {
    this.entries.set(feedback.id, feedback);
  }
  async loadImage(id: string) {
    return this.images.get(id) ?? null;
  }
  async remove(id: string) {
    this.entries.delete(id);
    this.images.delete(id);
  }
}

/**
 * The outbox's IDs, clock and dropped list: `waiting-1`, `waiting-2` …, kept a second apart, for
 * the Acme folder's connection unless `destination` says otherwise, with a lock of its own unless
 * it shares `lock`.
 */
function partsFor(
  dropped: string[] = [],
  firstId = "waiting",
  destination = "acme",
  lock: OutboxLock = pageOutboxLock(),
): OutboxParts {
  let next = 0;
  let clock = 0;
  return {
    newId: () => {
      next += 1;
      return `${firstId}-${next}`;
    },
    now: () => {
      clock += 1000;
      return clock;
    },
    dropped: (feedback) => dropped.push(feedback.task.title),
    destination,
    lock,
  };
}

/** A Paperclip that answers with `answer` for each task and numbers the tasks it creates. */
function paperclip(answer: (title: string) => SendOutcome | "sent") {
  const created: string[] = [];
  const sender = {
    async send(_id: string, sent: FeedbackTask) {
      const outcome = answer(sent.title);
      if (outcome !== "sent") {
        return outcome;
      }
      created.push(sent.title);
      const taskId = `ACME-${created.length}`;
      return {
        kind: "sent" as const,
        taskId,
        taskUrl: `https://paperclip.example/ACME/issues/${taskId}`,
      };
    },
  };
  return { sender, created };
}

function outboxWith(
  store: MemoryStore,
  answer: (title: string) => SendOutcome | "sent",
  dropped: string[] = [],
) {
  const { sender, created } = paperclip(answer);
  const outbox = new FeedbackOutbox(store, sender, partsFor(dropped));
  return { outbox, created };
}

/** A screenshot's task: the outbox loads the image only for a task that has one. */
function shotTask(title: string): FeedbackTask {
  return {
    ...task(title),
    screenshot: { fileName: "feedback.png", contentType: "image/png", width: 2, height: 2 },
  };
}

verifies("feedback.outbox", () => {
  it("sends at once when Studio is online, and keeps nothing", async () => {
    const store = new MemoryStore();
    const { outbox, created } = outboxWith(store, () => "sent");

    expect(await outbox.submit(task("Toast hides Send"), null)).toEqual({
      kind: "sent",
      taskId: "ACME-1",
      taskUrl: "https://paperclip.example/ACME/issues/ACME-1",
    });
    expect(created).toEqual(["Toast hides Send"]);
    expect(await outbox.waiting()).toBe(0);
  });

  it("keeps feedback while offline and sends it, oldest first, once back online", async () => {
    const store = new MemoryStore();
    let online = false;
    const { outbox, created } = outboxWith(store, () => (online ? "sent" : { kind: "offline" }));
    const image = new Uint8Array([137, 80, 78, 71]);

    expect(await outbox.submit(task("First"), image)).toEqual({ kind: "saved", until: "online" });
    expect(await outbox.submit(task("Second"), null)).toEqual({ kind: "saved", until: "online" });
    expect(await outbox.waiting()).toBe(2);
    expect(store.images.get("waiting-1")).toBe(image);

    online = true;
    const report = await outbox.flush();

    expect(created).toEqual(["First", "Second"]);
    expect(report.sent.map((each) => [each.feedback.task.title, each.taskId])).toEqual([
      ["First", "ACME-1"],
      ["Second", "ACME-2"],
    ]);
    expect(report.waiting).toBe(0);
  });

  it("says when it waits for a Paperclip connection rather than for the network", async () => {
    const { outbox } = outboxWith(new MemoryStore(), () => ({ kind: "not-connected" }));

    expect(await outbox.submit(task("No connection yet"), null)).toEqual({
      kind: "saved",
      until: "connected",
    });
  });

  it("stops at the first feedback that finds no connection", async () => {
    const store = new MemoryStore();
    let answers: (SendOutcome | "sent")[] = [
      { kind: "offline" },
      { kind: "offline" },
      { kind: "offline" },
    ];
    const { outbox, created } = outboxWith(store, () => answers.shift() ?? "sent");
    await outbox.submit(task("First"), null);
    await outbox.submit(task("Second"), null);
    await outbox.submit(task("Third"), null);

    answers = ["sent", { kind: "offline" }];
    const report = await outbox.flush();

    expect(created).toEqual(["First"]);
    expect(report.waiting).toBe(2);
    expect(store.titles).toEqual(["Second", "Third"]);
  });

  it("returns a refusal without keeping the feedback", async () => {
    const store = new MemoryStore();
    const { outbox } = outboxWith(store, () => ({ kind: "refused", reason: "project not found" }));

    expect(await outbox.submit(task("Wrong project"), null)).toEqual({
      kind: "refused",
      reason: "project not found",
    });
    expect(store.entries.size).toBe(0);
  });

  it("gives up on waiting feedback Paperclip refuses three times, with the reason", async () => {
    const store = new MemoryStore();
    let online = false;
    const { outbox } = outboxWith(store, () =>
      online ? { kind: "refused", reason: "assignee not found" } : { kind: "offline" },
    );
    await outbox.submit(task("For a gone agent"), null);
    online = true;

    expect((await outbox.flush()).givenUp).toEqual([]);
    expect(store.entries.get("waiting-1")).toMatchObject({
      refusals: 1,
      lastRefusal: "assignee not found",
    });
    expect((await outbox.flush()).givenUp).toEqual([]);
    const report = await outbox.flush();

    expect(report.givenUp.map((each) => [each.feedback.task.title, each.reason])).toEqual([
      ["For a gone agent", "assignee not found"],
    ]);
    expect(report.waiting).toBe(0);
  });

  it("loses no feedback kept while a pass is sending, and joins a pass already running", async () => {
    const store = new MemoryStore();
    let online = false;
    let releaseFirst: () => void = () => undefined;
    const firstHeld = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const { outbox, created } = outboxWith(store, () => (online ? "sent" : { kind: "offline" }));
    const heldSender = new FeedbackOutbox(
      store,
      {
        async send(_id, sent) {
          if (online && sent.title === "First") {
            await firstHeld;
          }
          return online && sent.title !== "Late"
            ? sentAs(sent.title, created)
            : { kind: "offline" };
        },
      },
      partsFor([], "late"),
    );
    await outbox.submit(task("First"), null);
    online = true;

    const pass = heldSender.flush();
    expect(heldSender.flush()).toBe(pass);
    // Keeping it waits for the pass's lock (`feedback.outbox-windows`), so it settles after.
    const late = heldSender.submit(task("Late"), null);
    releaseFirst();
    const report = await pass;
    await late;

    expect(report.sent.map((each) => each.feedback.task.title)).toEqual(["First"]);
    expect(store.titles).toEqual(["Late"]);
  });
});

function sentAs(title: string, created: string[]): SendOutcome {
  created.push(title);
  return { kind: "sent", taskId: `ACME-${created.length}`, taskUrl: "https://paperclip.example" };
}

verifies("feedback.outbox-retry", () => {
  it("creates no second task when a retry follows a lost reply", async () => {
    const store = new MemoryStore();
    // Like Paperclip with an idempotency key: one task per feedback ID, whatever the tries.
    const tasks = new Map<string, string>();
    const triedWith: string[] = [];
    let replyLost = true;
    const sender = {
      async send(id: string, _task: FeedbackTask, image: Uint8Array | null): Promise<SendOutcome> {
        triedWith.push(`${id} ${image?.length ?? 0}`);
        const taskId = tasks.get(id) ?? `ACME-${tasks.size + 1}`;
        tasks.set(id, taskId);
        if (replyLost) {
          return { kind: "offline" };
        }
        return { kind: "sent", taskId, taskUrl: `https://paperclip.example/ACME/issues/${taskId}` };
      },
    };
    const outbox = new FeedbackOutbox(store, sender, partsFor([], "feedback"));
    const image = new Uint8Array([137, 80, 78, 71]);

    expect(await outbox.submit(shotTask("Lost reply"), image)).toEqual({
      kind: "saved",
      until: "online",
    });
    replyLost = false;
    const report = await outbox.flush();

    expect(triedWith).toEqual(["feedback-1 4", "feedback-1 4"]);
    expect(tasks.size).toBe(1);
    expect(report.sent.map((each) => each.taskId)).toEqual(["ACME-1"]);
  });

  it("lists the waiting feedback without screenshots, and removes each with its own", async () => {
    const store = new MemoryStore();
    let online = false;
    const { outbox } = outboxWith(store, () => (online ? "sent" : { kind: "offline" }));
    const image = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

    await outbox.submit(shotTask("With a screenshot"), image);
    await outbox.submit(task("Without one"), null);

    const listed = await store.list();
    expect(listed.map((each) => [each.task.title, each.imageBytes])).toEqual([
      ["Without one", 0],
      ["With a screenshot", 8],
    ]);
    expect(JSON.stringify(listed)).not.toContain("137");
    expect([...store.images.keys()]).toEqual(["waiting-1"]);

    online = true;
    await outbox.flush();

    expect(store.images.size).toBe(0);
  });
});

verifies("feedback.outbox-cap", () => {
  it("drops the oldest past 50 waiting, and says which it dropped", async () => {
    const store = new MemoryStore();
    const dropped: string[] = [];
    const { outbox } = outboxWith(store, () => ({ kind: "offline" }), dropped);
    for (let index = 0; index < maxWaiting; index += 1) {
      await outbox.submit(task(`Feedback ${index}`), null);
    }

    expect(await outbox.submit(task("One more"), null)).toEqual({ kind: "saved", until: "online" });
    expect(await outbox.waiting()).toBe(maxWaiting);
    expect(dropped).toEqual(["Feedback 0"]);
    expect(store.titles.at(-1)).toBe("One more");
  });

  it("drops the oldest until the screenshots fit in 100 MB", async () => {
    const store = new MemoryStore();
    const dropped: string[] = [];
    const { outbox } = outboxWith(store, () => ({ kind: "offline" }), dropped);
    // Each screenshot is a quarter of the cap and a byte, so three fit and a fourth doesn't.
    const quarter = () => new Uint8Array(maxWaitingBytes / 4 + 1);
    await outbox.submit(shotTask("First"), quarter());
    await outbox.submit(task("No screenshot"), null);
    await outbox.submit(shotTask("Second"), quarter());
    await outbox.submit(shotTask("Third"), quarter());
    expect(dropped).toEqual([]);

    await outbox.submit(shotTask("Fourth"), quarter());

    expect(dropped).toEqual(["First"]);
    expect(store.titles).toEqual(["No screenshot", "Second", "Third", "Fourth"]);
    expect(store.images.has("waiting-1")).toBe(false);
  });

  it("deletes the screenshot of a feedback it drops to keep the cap", async () => {
    const store = new MemoryStore();
    const { outbox } = outboxWith(store, () => ({ kind: "offline" }));
    await outbox.submit(shotTask("Oldest"), new Uint8Array([1]));
    for (let index = 1; index < maxWaiting; index += 1) {
      await outbox.submit(task(`Feedback ${index}`), null);
    }

    await outbox.submit(task("One more"), null);

    expect(store.entries.has("waiting-1")).toBe(false);
    expect(store.images.size).toBe(0);
  });
});

verifies("feedback.outbox-windows", () => {
  it("sends a waiting feedback once when two windows flush at the same time", async () => {
    const store = new MemoryStore();
    const lock = pageOutboxLock();
    let online = false;
    const sentIds: string[] = [];
    const sender = {
      async send(id: string): Promise<SendOutcome> {
        if (!online) return { kind: "offline" };
        sentIds.push(id);
        return { kind: "sent", taskId: "ACME-1", taskUrl: "https://paperclip.example" };
      },
    };
    const main = new FeedbackOutbox(store, sender, partsFor([], "waiting", "acme", lock));
    const other = new FeedbackOutbox(store, sender, partsFor([], "other", "acme", lock));
    await main.submit(task("Run list jumps"), null);
    online = true;

    const reports = await Promise.all([main.flush(), other.flush()]);

    expect(sentIds).toEqual(["waiting-1"]);
    expect(reports.map((report) => report.sent.length)).toEqual([1, 0]);
    expect(store.entries.size).toBe(0);
  });

  it("keeps two windows' feedback under the cap when both keep one at once", async () => {
    const store = new MemoryStore();
    const lock = pageOutboxLock();
    const dropped: string[] = [];
    const offline = { send: async (): Promise<SendOutcome> => ({ kind: "offline" }) };
    const main = new FeedbackOutbox(store, offline, partsFor(dropped, "main", "acme", lock));
    const other = new FeedbackOutbox(store, offline, partsFor(dropped, "other", "acme", lock));
    for (let index = 1; index < maxWaiting; index += 1) {
      await main.submit(task(`Feedback ${index}`), null);
    }

    await Promise.all([
      main.submit(task("From main"), null),
      other.submit(task("From other"), null),
    ]);

    expect(await main.waiting()).toBe(maxWaiting);
    expect(dropped).toEqual(["Feedback 1"]);
  });

  it("sends only the feedback written for its own folder's connection", async () => {
    const store = new MemoryStore();
    let online = false;
    const { sender, created } = paperclip(() => (online ? "sent" : { kind: "offline" }));
    const acme = new FeedbackOutbox(store, sender, partsFor([], "acme", "acme"));
    const globex = new FeedbackOutbox(store, sender, partsFor([], "globex", "globex"));
    await acme.submit(task("For Acme"), null);
    await globex.submit(task("For Globex"), null);
    online = true;

    const report = await acme.flush();

    expect(created).toEqual(["For Acme"]);
    expect(store.titles).toEqual(["For Globex"]);
    expect(report.waiting).toBe(1);
    expect(store.entries.get("globex-1")?.destination).toBe("globex");
  });

  it("takes the lock every Studio window shares, by its name", async () => {
    const asked: string[] = [];
    const locks = {
      request<T>(name: string, callback: () => Promise<T>): Promise<T> {
        asked.push(name);
        return callback();
      },
    };

    expect(await webOutboxLock(locks)(async () => "done")).toBe("done");
    expect(asked).toEqual([outboxLockName]);
  });
});
