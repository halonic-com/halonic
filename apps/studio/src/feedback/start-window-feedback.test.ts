// @vitest-environment jsdom
import { pageOutboxLock } from "@halonicjs/studio-feature-feedback";
import type { OpenedWorkspace } from "@halonicjs/studio-feature-workspace";
import type { AgentConnection, AgentConnections } from "@halonicjs/studio-services";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MainWindowFeedback } from "./main-window-feedback.ts";
import { startFocusedWindowFeedback, startWindowFeedback } from "./start-window-feedback.ts";

/** Frames the window asked for and hasn't drawn yet; {@link drawFrame} draws them. */
let frames: FrameRequestCallback[] = [];
let stop: (() => void) | undefined;

beforeEach(() => {
  // The test draws the frames itself, so nothing waits on the clock.
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((frame) => frames.push(frame));
});

afterEach(() => {
  stop?.();
  stop = undefined;
  frames = [];
  vi.restoreAllMocks();
});

function drawFrame() {
  const due = frames;
  frames = [];
  for (const frame of due) frame(0);
}

/** Lets the promises the feedback started settle. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/** The main window's feedback with Acme shown, whose one Paperclip connection holds its key. */
function connectedFeedback(): MainWindowFeedback {
  const connections = {
    list: async () => [{ id: "board", state: { kind: "online", asOf: "" } } as AgentConnection],
    subscribe: () => () => undefined,
  };
  return new MainWindowFeedback({
    shown: () => ({
      location: "/work/acme",
      connections: connections as unknown as AgentConnections,
    }),
    subscribeShown: () => () => undefined,
    senderFor: () => ({ send: async () => ({ kind: "not-connected" }) }),
    store: () => Promise.reject(new Error("No waiting feedback in this test.")),
    lock: pageOutboxLock(),
    toasts: { show: () => undefined },
    openTask: () => undefined,
    log: () => undefined,
  });
}

/** The folder Acme as Halonic Inbox or Messenger opened it, whose one connection holds its key. */
function openedAcme(): { location: string; value: OpenedWorkspace } {
  const connections = {
    list: async () => [{ id: "board", state: { kind: "online", asOf: "" } } as AgentConnection],
    subscribe: () => () => undefined,
  };
  const services = { has: () => true, get: () => connections };
  const value = { name: "Acme", workspace: { services } } as unknown as OpenedWorkspace;
  return { location: "/work/acme", value };
}

function pressFeedbackShortcut(): KeyboardEvent {
  const keys = new KeyboardEvent("keydown", {
    code: "KeyF",
    key: "F",
    ctrlKey: true,
    shiftKey: true,
    cancelable: true,
  });
  window.dispatchEvent(keys);
  return keys;
}

verifies("studio.feedback-window", () => {
  it("asks the shell for a capture when Ctrl Shift F is pressed in the window that opened Acme", async () => {
    // The shell says capture isn't available, so no overlay needs drawing.
    const ipc = { invoke: vi.fn(async (_command: string) => Promise.reject("unavailable")) };
    stop = startFocusedWindowFeedback(
      { window },
      {
        ipc,
        platform: "windows",
        toasts: { show: () => undefined },
        opened: openedAcme(),
        openTask: () => undefined,
      },
    );
    await settle();

    const keys = pressFeedbackShortcut();
    drawFrame();
    drawFrame();
    await settle();

    expect(keys.defaultPrevented).toBe(true);
    expect(ipc.invoke).toHaveBeenCalledWith("plugin:feedback|start");
  });
});

verifies("feedback.help-send-feedback", () => {
  it("lets Help and Ctrl K begin a feedback in the main window, once it has drawn twice", async () => {
    // The shell says capture isn't available, so no overlay needs drawing.
    const ipc = { invoke: vi.fn(async (_command: string) => Promise.reject("unavailable")) };
    const feedback = connectedFeedback();
    stop = startWindowFeedback({ window }, ipc, "windows", { show: () => undefined }, feedback);
    await settle();
    expect(feedback.current()).toBe(true);

    feedback.begin();
    drawFrame();
    drawFrame();
    await settle();

    expect(ipc.invoke).toHaveBeenCalledWith("plugin:feedback|start");
  });
});
