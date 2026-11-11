// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { installFakePopover } from "../test-support/fake-popover.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ItemPage, type ItemPageChat, type ItemPageProps } from "./item-page.tsx";

type View = "flow" | "configuration";

const views: ItemPageProps<View>["views"] = [
  { id: "flow", label: "Flow" },
  { id: "configuration", label: "Configuration" },
];

/** A `ResizeObserver` for jsdom, which has none: `resize` reports a new width to every target. */
class FakeResizeObserver {
  static readonly observers = new Set<FakeResizeObserver>();
  static width = 1600;

  private readonly targets = new Set<Element>();
  private readonly callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  static resize(width: number): void {
    FakeResizeObserver.width = width;
    act(() => {
      for (const observer of FakeResizeObserver.observers) {
        observer.report();
      }
    });
  }

  observe(target: Element): void {
    this.targets.add(target);
    FakeResizeObserver.observers.add(this);
    this.report();
  }

  disconnect(): void {
    FakeResizeObserver.observers.delete(this);
  }

  unobserve(): void {}

  private report(): void {
    const entries = [...this.targets].map(
      (target) =>
        ({ target, contentRect: { width: FakeResizeObserver.width } }) as ResizeObserverEntry,
    );
    this.callback(entries, this as unknown as ResizeObserver);
  }
}

let uninstallPopover: () => void;

beforeEach(() => {
  uninstallPopover = installFakePopover();
  FakeResizeObserver.width = 1600;
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  unmountAll();
  uninstallPopover();
  FakeResizeObserver.observers.clear();
  Reflect.deleteProperty(globalThis, "ResizeObserver");
});

const agentChat: ItemPageChat = {
  startsOpen: true,
  render: (close) => (
    <>
      <p>Chat with Refund checker</p>
      <button type="button" onClick={close}>
        Close chat
      </button>
    </>
  ),
};

function renderItem(chat: ItemPageChat | undefined, kind = "Agent"): HTMLElement {
  return render(
    <ItemPage<View>
      icon={<svg />}
      kind={kind}
      name="Refund checker"
      onRename={() => {}}
      views={views}
      chat={chat}
    >
      {(view) => <p>{view} view</p>}
    </ItemPage>,
  );
}

function button(container: HTMLElement, name: string): HTMLButtonElement | undefined {
  return [...container.querySelectorAll("button")].find(
    (candidate) => (candidate.getAttribute("aria-label") ?? candidate.textContent) === name,
  );
}

function press(container: HTMLElement, name: string): void {
  act(() => button(container, name)?.click());
}

function chat(container: HTMLElement): HTMLElement | null {
  return container.querySelector('section[aria-label="Chat"]');
}

function viewsNav(container: HTMLElement): HTMLElement | null {
  return container.querySelector('header [role="tablist"]');
}

function panel(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[role="tabpanel"]');
}

/** The box beside the chat that sets the panel's width. */
function panelBox(container: HTMLElement): HTMLElement {
  return panel(container)?.parentElement as HTMLElement;
}

verifies("shell.item-page-chat", () => {
  it("puts the chat on the left and the view in a 700px panel on the right", () => {
    const container = renderItem(agentChat);
    expect(chat(container)?.textContent).toContain("Chat with Refund checker");
    expect(panelBox(container).style.width).toBe("700px");
    expect(panelBox(container).previousElementSibling).toBe(chat(container));
    expect(button(container, "Close Flow")).toBeDefined();
  });

  it("starts a closed chat as an Ask about button, and the chat can close itself", () => {
    const container = renderItem({ ...agentChat, startsOpen: false }, "Skill");
    expect(chat(container)).toBeNull();
    expect(panel(container)?.textContent).toBe("flow view");
    press(container, "Ask about this skill…");
    expect(chat(container)).not.toBeNull();
    expect(document.activeElement).toBe(chat(container));
    press(container, "Close chat");
    expect(chat(container)).toBeNull();
    expect(document.activeElement).toBe(button(container, "Ask about this skill…"));
  });

  it("hides the panel with ✕ and shows it again with the button named after the view", () => {
    const container = renderItem(agentChat);
    press(container, "Close Flow");
    expect(panel(container)).toBeNull();
    expect(viewsNav(container)).toBeNull();
    expect(chat(container)?.className).toContain("max-w-reading");
    expect(document.activeElement).toBe(button(container, "Flow"));

    press(container, "Flow");
    expect(panel(container)?.textContent).toBe("flow view");
    expect(document.activeElement?.getAttribute("role")).toBe("tab");
    expect(document.activeElement?.getAttribute("aria-selected")).toBe("true");
  });

  it("turns the panel into a button in a narrow tab, with ← Chat on its own screen", () => {
    FakeResizeObserver.width = 800;
    const container = renderItem(agentChat);
    expect(panel(container)).toBeNull();
    expect(button(container, "Close Flow")).toBeUndefined();

    press(container, "Flow");
    expect(chat(container)).toBeNull();
    expect(panel(container)?.textContent).toBe("flow view");
    expect(viewsNav(container)).not.toBeNull();

    press(container, "Chat");
    expect(panel(container)).toBeNull();
    expect(document.activeElement).toBe(button(container, "Flow"));
  });

  it("puts the panel beside the chat again once the tab widens", () => {
    FakeResizeObserver.width = 800;
    const container = renderItem(agentChat);
    press(container, "Flow");
    FakeResizeObserver.resize(1200);
    expect(chat(container)).not.toBeNull();
    expect(panelBox(container).style.width).toBe("700px");
  });

  it("gives the whole tab to the view with no chat for the kind", () => {
    const container = renderItem(undefined, "Workflow");
    expect(chat(container)).toBeNull();
    expect(panel(container)?.textContent).toBe("flow view");
    const buttons = [...container.querySelectorAll("header button")].map(
      (candidate) => candidate.getAttribute("aria-label") ?? candidate.textContent,
    );
    expect(buttons.filter((name) => /Ask about|Close|Chat/.test(name ?? ""))).toEqual([]);
  });
});
