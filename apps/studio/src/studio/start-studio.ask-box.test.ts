// @vitest-environment jsdom

import { RecentWorkspaces } from "@halonicjs/studio-feature-workspace";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type StartedStudio, startStudio } from "./start-studio.ts";

/** A desktop window: jsdom has no `matchMedia`, and the shell follows the phone width with it. */
function desktopMediaQueries(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  };
}

const asOf = "2026-11-26T09:00:00.000Z";
const source = {
  id: "acme",
  provider: "paperclip",
  label: "Paperclip · Acme",
  state: { kind: "online", asOf },
};
const chief = { id: "agent-chief", source: "acme", name: "Chief", activity: "idle" };
const chatWithChief = {
  id: "chat-chief",
  source: "acme",
  agent: chief.id,
  title: "Chief",
  updatedAt: asOf,
  waitingForMe: false,
};

/** What the agent host's messaging routes answer: Acme's chat with Chief, and a sent question. */
function messagingAnswer(route: string, body: Record<string, unknown>): Promise<unknown> {
  if (route === "POST /v1/messaging/read") {
    const lists: Record<string, unknown[]> = {
      sources: [source],
      agents: [chief],
      conversations: [chatWithChief],
    };
    return Promise.resolve({ items: lists[String(body["list"])] ?? [] });
  }
  if (route === "POST /v1/messaging/send") {
    const message = {
      id: "question",
      conversation: chatWithChief.id,
      author: { kind: "me" },
      body: body["body"],
      attachments: [],
      sentAt: asOf,
    };
    return Promise.resolve({ result: { outcome: "sent", message } });
  }
  // Nothing changes while the box shows: the long wait for a change doesn't end in the test.
  if (route === "POST /v1/messaging/changes") {
    return body["wait"] === true
      ? new Promise(() => undefined)
      : Promise.resolve({ next: 0, sources: [] });
  }
  return Promise.resolve({});
}

/** The desktop app's webview in the window labelled `ask`, recording each command and host route. */
function askWebview(called: string[], routes: string[]) {
  const invoke = async (command: string, args: Record<string, unknown> = {}) => {
    called.push(command);
    if (command === "host_settings_read") return {};
    if (command !== "agent_host_request") return null;
    const route = String(args["route"]);
    routes.push(route);
    const body = (args["body"] ?? {}) as Record<string, unknown>;
    return { status: 200, body: await messagingAnswer(route, body) };
  };
  return Object.assign(new EventTarget(), {
    __TAURI_INTERNALS__: {
      invoke,
      transformCallback: () => 1,
      unregisterCallback: () => {},
      metadata: { currentWindow: { label: "ask" } },
    },
  });
}

/** Storage with Acme first in Recent, as Studio leaves it once it opened Acme. */
function storageWithAcme(remembered: boolean) {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
  if (remembered) new RecentWorkspaces(storage).remember({ location: "/work/acme", name: "acme" });
  return storage;
}

/** Types `text` into the box's text box, as React hears it. */
function typeIn(field: HTMLTextAreaElement, text: string): void {
  const prototype = Object.getPrototypeOf(field) as object;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, text);
  field.dispatchEvent(new Event("input", { bubbles: true }));
}

function pressKey(field: Element, key: string): void {
  field.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

let element: HTMLDivElement;
let started: StartedStudio | undefined;

beforeEach(() => {
  window.matchMedia = desktopMediaQueries;
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(async () => {
  await started?.stop();
  started = undefined;
  element.remove();
});

function start(webview: object, remembered = true) {
  started = startStudio({
    element,
    window: webview,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    storage: storageWithAcme(remembered),
  });
}

verifies("studio.ask-box-window", () => {
  it("calls only the box's commands while it opens, asks and hides", async () => {
    const called: string[] = [];
    const routes: string[] = [];
    const webview = askWebview(called, routes);
    start(webview);

    const box = await vi.waitFor(
      () => {
        const found = element.querySelector("textarea");
        expect(found?.placeholder).toBe("Ask Chief anything");
        return found as HTMLTextAreaElement;
      },
      { timeout: 15_000 },
    );
    // The window losing and getting the focus says nothing about Studio's window.
    webview.dispatchEvent(new Event("blur"));
    webview.dispatchEvent(new Event("focus"));
    typeIn(box, "Where are we?");
    pressKey(box, "Enter");
    await vi.waitFor(() => expect(routes).toContain("POST /v1/messaging/send"));
    pressKey(box, "Escape");
    await vi.waitFor(() => expect(called).toContain("plugin:quick-ask|hide"));

    expect(new Set(called)).toEqual(
      new Set([
        "reopen_folder",
        "host_settings_read",
        "agent_host_request",
        "plugin:quick-ask|hide",
      ]),
    );
    expect(new Set(routes)).toEqual(
      new Set(["POST /v1/messaging/read", "POST /v1/messaging/changes", "POST /v1/messaging/send"]),
    );
  }, 30_000);

  it("calls only show_main_window from Open Halonic when Recent has no workspace", async () => {
    const called: string[] = [];
    start(askWebview(called, []), false);

    const button = await vi.waitFor(() => {
      const found = [...element.querySelectorAll("button")].find(
        (candidate) => candidate.textContent === "Open Halonic",
      );
      if (found === undefined) throw new Error("No Open Halonic button yet.");
      return found;
    });
    expect(element.textContent).toContain("Open Halonic to choose a workspace.");
    button.click();

    expect(called).toEqual(["show_main_window"]);
  });
});
