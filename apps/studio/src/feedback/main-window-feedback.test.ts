import {
  type FeedbackStore,
  type FeedbackTask,
  pageOutboxLock,
  type SendOutcome,
  type WaitingFeedback,
} from "@halonicjs/studio-feature-feedback";
import type { AgentConnection, AgentConnections } from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";
import { destinationOf } from "./folder-feedback-sender.ts";
import { MainWindowFeedback, type MainWindowFeedbackParts } from "./main-window-feedback.ts";

function task(title: string): FeedbackTask {
  return { title, description: title, project: "Acme apps", assignee: "Robin", screenshot: null };
}

class MemoryStore implements FeedbackStore {
  readonly entries = new Map<string, WaitingFeedback>();
  async list() {
    return [...this.entries.values()];
  }
  async add(feedback: WaitingFeedback) {
    this.entries.set(feedback.id, feedback);
  }
  async update(feedback: WaitingFeedback) {
    this.entries.set(feedback.id, feedback);
  }
  async loadImage() {
    return null;
  }
  async remove(id: string) {
    this.entries.delete(id);
  }
}

/** Acme's connections, each holding its key while it is in `signedIn`; at first only board. */
function acmeConnections() {
  const listeners = new Set<() => void>();
  const connections = {
    signedIn: ["board"],
    list: async () =>
      ["board", "other"].map(
        (id) =>
          ({
            id,
            state: connections.signedIn.includes(id)
              ? { kind: "online", asOf: "" }
              : { kind: "no-key" },
          }) as AgentConnection,
      ),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    change(signedIn: string[]) {
      connections.signedIn = signedIn;
      for (const listener of listeners) listener();
    },
  };
  return connections;
}

/** The main window with Acme shown, whose Paperclip answers `answer`. */
function mainWindow(answer: () => SendOutcome = () => sent("ACME-12")) {
  const store = new MemoryStore();
  const connections = acmeConnections();
  const toasts: { title: string; text?: string; action?: { onClick(): void } }[] = [];
  const opened: string[] = [];
  const send = vi.fn(async (_id: string, _task: FeedbackTask) => answer());
  const senders: string[] = [];
  const parts: MainWindowFeedbackParts = {
    shown: () => ({
      location: "/work/acme",
      connections: connections as unknown as AgentConnections,
    }),
    subscribeShown: () => () => undefined,
    senderFor: (location, connection) => {
      senders.push(`${location} ${connection}`);
      return { send };
    },
    store: async () => store,
    lock: pageOutboxLock(),
    toasts: { show: (message) => toasts.push(message) },
    openTask: (taskUrl) => opened.push(taskUrl),
    log: () => undefined,
  };
  const feedback = new MainWindowFeedback(parts);
  const window = new EventTarget();
  const stop = feedback.start(window);
  return { feedback, store, connections, toasts, opened, send, senders, window, stop };
}

function sent(taskId: string): SendOutcome {
  return { kind: "sent", taskId, taskUrl: `https://paperclip.acme.test/ACME/issues/${taskId}` };
}

/** Lets the promises the feedback started settle. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

verifies("studio.feedback-send", () => {
  it("sends once and says Feedback sent, whose Open task opens the task", async () => {
    const { feedback, toasts, opened, send, senders } = mainWindow();
    await settle();

    expect(await feedback.send({ task: task("Run list jumps"), png: null })).toEqual({
      kind: "taken",
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(senders).toEqual(["/work/acme board"]);
    expect(toasts.map((toast) => [toast.title, toast.text])).toEqual([
      ["Feedback sent", "ACME-12 · Run list jumps"],
    ]);
    toasts[0]?.action?.onClick();
    expect(opened).toEqual(["https://paperclip.acme.test/ACME/issues/ACME-12"]);
  });

  it.each([
    ["offline", "It sends by itself once Studio is back online."],
    ["not-connected", "It sends by itself once Studio is connected to Paperclip."],
  ] as const)("says Feedback saved when Studio is %s", async (kind, line) => {
    const { feedback, toasts, store } = mainWindow(() => ({ kind }));
    await settle();

    await feedback.send({ task: task("Run list jumps"), png: null });

    expect(toasts.map((toast) => [toast.title, toast.text])).toEqual([["Feedback saved", line]]);
    expect(await feedback.waiting()).toBe(1);
    expect([...store.entries.values()][0]?.destination).toBe(destinationOf("/work/acme", "board"));
  });

  it("hands a refusal back to the dialog, with no toast", async () => {
    const { feedback, toasts } = mainWindow(() => ({ kind: "refused", reason: "" }));
    await settle();

    expect(await feedback.send({ task: task("Run list jumps"), png: null })).toEqual({
      kind: "refused",
      reason: "",
    });
    expect(toasts).toEqual([]);
  });

  it("sends the waiting feedback when the window regains focus, with Feedback sent", async () => {
    let online = false;
    const { feedback, toasts, send, window } = mainWindow(() =>
      online ? sent("ACME-13") : { kind: "offline" },
    );
    await settle();
    await feedback.send({ task: task("Run list jumps"), png: null });
    online = true;

    window.dispatchEvent(new Event("focus"));
    await vi.waitFor(() => expect(toasts.at(-1)?.title).toBe("Feedback sent"));

    expect(send).toHaveBeenCalledTimes(2);
    expect(toasts.at(-1)?.text).toBe("ACME-13 · Run list jumps");
    expect(await feedback.waiting()).toBe(0);
  });

  it("is connected while a connection of the folder holds its key, and says when that changes", async () => {
    const { feedback, connections, stop } = mainWindow();
    const heard: boolean[] = [];
    feedback.subscribe(() => heard.push(feedback.current()));
    await settle();
    expect(feedback.current()).toBe(true);

    connections.change([]);
    await settle();
    connections.change(["board"]);
    await settle();
    stop();

    expect(heard).toEqual([true, false, true]);
  });

  it("keeps a feedback for its connection, never sending it through one that signs in later", async () => {
    const { feedback, connections, send, senders, store } = mainWindow(() => ({
      kind: "not-connected",
    }));
    await settle();
    await feedback.send({ task: task("Run list jumps"), png: null });

    connections.change(["other"]);
    await settle();

    expect(send).toHaveBeenCalledTimes(1);
    expect(senders).toEqual(["/work/acme board", "/work/acme other"]);
    expect([...store.entries.values()].map((waiting) => waiting.destination)).toEqual([
      destinationOf("/work/acme", "board"),
    ]);
  });
});
