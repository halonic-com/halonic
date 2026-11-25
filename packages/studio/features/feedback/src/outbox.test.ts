import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import {
  FeedbackOutbox,
  type FeedbackStore,
  maxWaiting,
  type SendOutcome,
  type WaitingFeedback,
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

/** A store kept in memory, as Studio's would be on disk. */
class MemoryStore implements FeedbackStore {
  saved: readonly WaitingFeedback[] = [];
  async load() {
    return this.saved;
  }
  async save(waiting: readonly WaitingFeedback[]) {
    this.saved = waiting;
  }
}

/** A Paperclip that answers with `answer` for each task and numbers the tasks it creates. */
function paperclip(answer: (title: string) => SendOutcome | "sent") {
  const created: string[] = [];
  const sender = {
    async send(sent: FeedbackTask) {
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

function outboxWith(store: MemoryStore, answer: (title: string) => SendOutcome | "sent") {
  let next = 0;
  const { sender, created } = paperclip(answer);
  const outbox = new FeedbackOutbox(store, sender, () => {
    next += 1;
    return `waiting-${next}`;
  });
  return { outbox, created };
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
    expect(store.saved[0]?.image).toBe(image);

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
    expect(store.saved.map((each) => each.task.title)).toEqual(["Second", "Third"]);
  });

  it("returns a refusal without keeping the feedback", async () => {
    const store = new MemoryStore();
    const { outbox } = outboxWith(store, () => ({ kind: "refused", reason: "project not found" }));

    expect(await outbox.submit(task("Wrong project"), null)).toEqual({
      kind: "refused",
      reason: "project not found",
    });
    expect(store.saved).toEqual([]);
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
    expect(store.saved[0]).toMatchObject({ refusals: 1, lastRefusal: "assignee not found" });
    expect((await outbox.flush()).givenUp).toEqual([]);
    const report = await outbox.flush();

    expect(report.givenUp.map((each) => [each.feedback.task.title, each.reason])).toEqual([
      ["For a gone agent", "assignee not found"],
    ]);
    expect(report.waiting).toBe(0);
  });

  it("keeps no more than the limit and says it is full", async () => {
    const store = new MemoryStore();
    const { outbox } = outboxWith(store, () => ({ kind: "offline" }));
    for (let index = 0; index < maxWaiting; index += 1) {
      await outbox.submit(task(`Feedback ${index}`), null);
    }

    expect(await outbox.submit(task("One too many"), null)).toEqual({ kind: "full" });
    expect(await outbox.waiting()).toBe(maxWaiting);
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
        async send(sent) {
          if (online && sent.title === "First") {
            await firstHeld;
          }
          return online && sent.title !== "Late"
            ? sentAs(sent.title, created)
            : { kind: "offline" };
        },
      },
      () => "late-1",
    );
    await outbox.submit(task("First"), null);
    online = true;

    const pass = heldSender.flush();
    expect(heldSender.flush()).toBe(pass);
    await heldSender.submit(task("Late"), null);
    releaseFirst();
    const report = await pass;

    expect(report.sent.map((each) => each.feedback.task.title)).toEqual(["First"]);
    expect(store.saved.map((each) => each.task.title)).toEqual(["Late"]);
  });
});

function sentAs(title: string, created: string[]): SendOutcome {
  created.push(title);
  return { kind: "sent", taskId: `ACME-${created.length}`, taskUrl: "https://paperclip.example" };
}
