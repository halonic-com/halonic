// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
  /** Off for a browser that reports a little after the page is drawn. */
  static reportsOnObserve = true;

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
    if (FakeResizeObserver.reportsOnObserve) {
      this.report();
    }
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
  FakeResizeObserver.reportsOnObserve = true;
  globalThis.ResizeObserver = FakeResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  unmountAll();
  uninstallPopover();
  FakeResizeObserver.observers.clear();
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, "ResizeObserver");
});

const agentChat: ItemPageChat = {
  startsOpen: true,
  render: (close) => (
    <>
      <p>Chat with Refund checker</p>
      <input aria-label="Message" />
      <button type="button" onClick={close}>
        Close chat
      </button>
    </>
  ),
};

function Item({ chat, kind }: { readonly chat: ItemPageChat | undefined; readonly kind: string }) {
  return (
    <ItemPage<View>
      icon={<svg />}
      kind={kind}
      name="Refund checker"
      onRename={() => {}}
      views={views}
      chat={chat}
    >
      {(view) => (
        <>
          <p>{view} view</p>
          <input aria-label="Draft" />
        </>
      )}
    </ItemPage>
  );
}

function renderItem(chat: ItemPageChat | undefined, kind = "Agent"): HTMLElement {
  return render(<Item chat={chat} kind={kind} />);
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

/** Whether `element` is in the page and not hidden. */
function shown(element: HTMLElement | null): boolean {
  return element !== null && !element.hidden;
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

/** Types `value` into the input named `name`, the way a user leaves a draft. */
function type(container: HTMLElement, name: string, value: string): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(`input[aria-label="${name}"]`);
  if (input === null) {
    throw new Error(`no input named ${name}`);
  }
  input.value = value;
  return input;
}

verifies("shell.item-page-chat", () => {
  it("puts the chat on the left and the view in a 700px panel on the right", () => {
    const container = renderItem(agentChat);
    expect(chat(container)?.textContent).toContain("Chat with Refund checker");
    expect(shown(chat(container))).toBe(true);
    expect(panelBox(container).style.width).toBe("700px");
    expect(panelBox(container).previousElementSibling).toBe(chat(container));
    expect(button(container, "Close Flow")).toBeDefined();
  });

  it("starts a closed chat as an Ask about button, and the chat can close itself", () => {
    const container = renderItem({ ...agentChat, startsOpen: false }, "Skill");
    expect(shown(chat(container))).toBe(false);
    expect(panel(container)?.textContent).toBe("flow view");
    press(container, "Ask about this skill…");
    expect(shown(chat(container))).toBe(true);
    expect(document.activeElement).toBe(chat(container));
    press(container, "Close chat");
    expect(shown(chat(container))).toBe(false);
    expect(document.activeElement).toBe(button(container, "Ask about this skill…"));
  });

  it("starts a chat open when the feature provides it after the first render", () => {
    let provide: (chat: ItemPageChat) => void = () => {};
    function LateChat() {
      const [chat, setChat] = useState<ItemPageChat | undefined>(undefined);
      provide = setChat;
      return <Item chat={chat} kind="Agent" />;
    }
    const container = render(<LateChat />);
    expect(chat(container)).toBeNull();
    act(() => provide(agentChat));
    expect(shown(chat(container))).toBe(true);
    expect(button(container, "Close Flow")).toBeDefined();
  });

  it("hides the panel with ✕ and shows it again with the button named after the view", () => {
    const container = renderItem(agentChat);
    press(container, "Close Flow");
    expect(shown(panelBox(container))).toBe(false);
    expect(viewsNav(container)).toBeNull();
    expect(chat(container)?.className).toContain("max-w-reading");
    expect(document.activeElement).toBe(button(container, "Flow"));

    press(container, "Flow");
    expect(shown(panelBox(container))).toBe(true);
    expect(panel(container)?.textContent).toBe("flow view");
    expect(document.activeElement?.getAttribute("role")).toBe("tab");
    expect(document.activeElement?.getAttribute("aria-selected")).toBe("true");
  });

  it("turns the panel into a button in a narrow tab, with ← Chat on its own screen", () => {
    FakeResizeObserver.width = 800;
    const container = renderItem(agentChat);
    expect(shown(panelBox(container))).toBe(false);
    expect(button(container, "Close Flow")).toBeUndefined();

    press(container, "Flow");
    expect(shown(chat(container))).toBe(false);
    expect(shown(panelBox(container))).toBe(true);
    expect(panel(container)?.textContent).toBe("flow view");
    expect(viewsNav(container)).not.toBeNull();
    expect(container.firstElementChild?.className).toContain("min-h-full");

    press(container, "Chat");
    expect(shown(panelBox(container))).toBe(false);
    expect(document.activeElement).toBe(button(container, "Flow"));
  });

  it("draws a narrow tab narrow from the first frame, before the tab's size is reported", () => {
    FakeResizeObserver.reportsOnObserve = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 800,
    } as DOMRect);
    const container = renderItem(agentChat);
    expect(shown(panelBox(container))).toBe(false);
    expect(button(container, "Flow")).toBeDefined();
  });

  it("puts the panel beside the chat again once the tab widens", () => {
    FakeResizeObserver.width = 800;
    const container = renderItem(agentChat);
    press(container, "Flow");
    FakeResizeObserver.resize(1200);
    expect(shown(chat(container))).toBe(true);
    expect(shown(panelBox(container))).toBe(true);
    expect(panelBox(container).style.width).toBe("700px");
  });

  it("keeps the chat's and the view's drafts through every change of layout", () => {
    const container = renderItem(agentChat);
    const message = type(container, "Message", "Why was order 12 refunded?");
    const draft = type(container, "Draft", "Check the amount first");
    const stillThere = () => {
      expect(container.querySelector('input[aria-label="Message"]')).toBe(message);
      expect(container.querySelector('input[aria-label="Draft"]')).toBe(draft);
      expect(message.value).toBe("Why was order 12 refunded?");
      expect(draft.value).toBe("Check the amount first");
    };

    for (const name of ["Close Flow", "Flow", "Close chat", "Ask about this agent…"]) {
      press(container, name);
      stillThere();
    }
    FakeResizeObserver.resize(800);
    stillThere();
    press(container, "Flow");
    stillThere();
    press(container, "Chat");
    stillThere();
    FakeResizeObserver.resize(1600);
    stillThere();
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
