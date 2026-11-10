// @vitest-environment jsdom

import type { EngineConnection, EngineConnectionState } from "@halonicjs/ports";
import { createToastStore, Dialog, usePresentation } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import { createCloseStack } from "../close-stack/close-stack.ts";
import { createShellEngine } from "../engine/engine-connection.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ShellFrame } from "./shell-frame.tsx";

let media: FakeMediaQueries;
let uninstall: () => void;
let restoreModal: () => void;

beforeEach(() => {
  media = new FakeMediaQueries(1440);
  uninstall = media.install();
  restoreModal = fakeShowModal();
});

// The frame unmounts first: a Dialog's unmount still calls the fake close().
afterEach(() => {
  unmountAll();
  restoreModal();
  uninstall();
});

function ShowPresentation() {
  return <p>{usePresentation()}</p>;
}

function renderFrame(page = <ShowPresentation />) {
  const timers = new FakeTimers();
  const announcer = createAnnouncer({ timers });
  const closeStack = createCloseStack();
  const engine = createShellEngine(announcer, timers);
  const toasts = createToastStore();
  const container = render(
    <ShellFrame
      announcer={announcer}
      closeStack={closeStack}
      engine={engine}
      toasts={toasts}
      language="en"
      toolbar={<button type="button">Back</button>}
      statusBar="1 error"
    >
      {page}
    </ShellFrame>,
  );
  return { container, timers, announcer, closeStack, engine, toasts };
}

function pressEscape(target: Element): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

/**
 * jsdom has `<dialog>` but no `showModal()`; opening it is all the Dialog tests need. Returns a
 * function that puts the original methods back, so the fake doesn't leak into other files.
 */
function fakeShowModal(): () => void {
  const prototype = HTMLDialogElement.prototype;
  const original = {
    showModal: Object.getOwnPropertyDescriptor(prototype, "showModal"),
    close: Object.getOwnPropertyDescriptor(prototype, "close"),
  };
  Object.defineProperty(prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
  return () => {
    for (const [name, descriptor] of Object.entries(original)) {
      if (descriptor === undefined) {
        Reflect.deleteProperty(prototype, name);
      } else {
        Object.defineProperty(prototype, name, descriptor);
      }
    }
  };
}

function nextFrame(): Promise<void> {
  return act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

verifies("shell.frame", () => {
  it("shows the title bar on the halo and the panel with the toolbar, the page and the status bar on the desktop", () => {
    const { container } = renderFrame();
    const frame = container.querySelector('[data-layout="desktop"]') as HTMLElement;
    const [titleBar, panel] = Array.from(frame.children);
    expect(titleBar?.tagName).toBe("HEADER");
    expect(titleBar?.className).toContain("h-titlebar");
    expect(panel?.className).toContain("rounded-md");
    expect(panel?.firstElementChild?.textContent).toBe("Back");
    expect(panel?.firstElementChild?.className).toContain("h-toolbar");
    expect(panel?.querySelector("main")?.textContent).toBe("desktop");
    const statusBar = panel?.lastElementChild;
    expect(statusBar?.tagName).toBe("FOOTER");
    expect(statusBar?.className).toContain("h-statusbar");
    expect(statusBar?.textContent).toBe("1 error");
  });

  it("shows only the page on a phone, and follows the width without a reload", () => {
    const { container } = renderFrame();
    act(() => media.resize(400));
    expect(container.querySelector('[data-layout="phone"] main')?.textContent).toBe("phone");
    expect(container.querySelector("header")).toBeNull();
    expect(container.querySelector("footer")).toBeNull();
    expect(container.textContent).not.toContain("Back");

    act(() => media.resize(800));
    expect(container.querySelector('[data-layout="desktop"] main')?.textContent).toBe("desktop");
  });

  it("keeps the page and its state when the width crosses to the phone and back", () => {
    const { container } = renderFrame(<input aria-label="Name" />);
    const input = container.querySelector("input") as HTMLInputElement;
    input.value = "Sorter";
    input.focus();

    act(() => media.resize(400));
    act(() => media.resize(1440));

    expect(container.querySelector("input")).toBe(input);
    expect(input.value).toBe("Sorter");
    expect(document.activeElement).toBe(input);
  });

  it("sets the document's language", () => {
    document.documentElement.lang = "";
    renderFrame();
    expect(document.documentElement.lang).toBe("en");
  });

  it("passes Esc to the close stack and stops it only when a layer took it", () => {
    const { container, closeStack } = renderFrame();
    let menuOpen = true;
    closeStack.open({
      kind: "menu",
      close: () => {
        menuOpen = false;
        return true;
      },
    });
    const main = container.querySelector("main") as HTMLElement;

    expect(pressEscape(main).defaultPrevented).toBe(true);
    expect(menuOpen).toBe(false);
    expect(pressEscape(main).defaultPrevented).toBe(false);
  });

  it("ignores Esc while an input method is composing", () => {
    const { container, closeStack } = renderFrame();
    let closed = false;
    closeStack.open({
      kind: "menu",
      close: () => {
        closed = true;
        return true;
      },
    });
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, isComposing: true });
    act(() => {
      container.querySelector("main")?.dispatchEvent(event);
    });
    expect(closed).toBe(false);
  });

  it("ignores the Esc that WebKit sends to end a composition, with key code 229", () => {
    const { container, closeStack } = renderFrame();
    let closed = false;
    closeStack.open({
      kind: "menu",
      close: () => {
        closed = true;
        return true;
      },
    });
    // KeyboardEventInit has no keyCode, so the test sets it on the event as WebKit does.
    const event = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      isComposing: false,
    });
    Object.defineProperty(event, "keyCode", { value: 229 });
    act(() => {
      container.querySelector("main")?.dispatchEvent(event);
    });
    expect(closed).toBe(false);
  });

  it("leaves Esc inside an open dialog to the dialog", () => {
    const { container, closeStack } = renderFrame(
      <dialog open>
        <button type="button">Cancel</button>
      </dialog>,
    );
    let panelOpen = true;
    closeStack.open({
      kind: "side-panel",
      close: () => {
        panelOpen = false;
        return true;
      },
    });
    pressEscape(container.querySelector("dialog button") as HTMLElement);
    expect(panelOpen).toBe(true);
  });

  it("leaves Esc to an open modal Dialog even when focus is on the body", () => {
    const { closeStack } = renderFrame(
      <Dialog
        title="Delete Sorter?"
        confirm={{ label: "Delete", variant: "danger", busyLabel: "Deleting…" }}
        onConfirm={() => {}}
        onCancel={() => {}}
      >
        <p>Sorter goes to the trash.</p>
      </Dialog>,
    );
    let panelOpen = true;
    closeStack.open({
      kind: "side-panel",
      close: () => {
        panelOpen = false;
        return true;
      },
    });
    const event = pressEscape(document.body);
    expect(panelOpen).toBe(true);
    expect(event.defaultPrevented).toBe(false);
  });

  it("reads announcements in its own live regions", async () => {
    const { container, timers, announcer } = renderFrame();
    act(() => {
      announcer.announce("Saved key for Anthropic");
      timers.advance(0);
    });
    await nextFrame();
    const polite = container.querySelector('[aria-live="polite"]');
    expect(polite?.textContent).toBe("Saved key for Anthropic");
    expect(polite?.className).toBe("sr-only");
    expect(container.querySelector('[aria-live="assertive"]')?.getAttribute("role")).toBeNull();
  });

  it("sends a kit Dialog's announcements to the Dialog's own regions", async () => {
    const { container, timers, announcer } = renderFrame(
      <Dialog
        title="Delete Sorter?"
        confirm={{ label: "Delete", variant: "danger", busyLabel: "Deleting…" }}
        onConfirm={() => {}}
        onCancel={() => {}}
      >
        <p>Sorter goes to the trash.</p>
      </Dialog>,
    );
    act(() => {
      announcer.announce("Copied");
      timers.advance(0);
    });
    await nextFrame();
    expect(container.querySelector('dialog [aria-live="polite"]')?.textContent).toBe("Copied");
  });

  it("tells the announcer when the window loses and gains focus", async () => {
    const { container, timers, announcer } = renderFrame();
    act(() => {
      window.dispatchEvent(new Event("blur"));
      announcer.announce("fin@acme.example is signed in.", "polite", { whenWindowFocused: true });
      timers.advance(0);
    });
    await nextFrame();
    const polite = container.querySelector('[aria-live="polite"]');
    expect(polite?.textContent).toBe("");
    act(() => {
      window.dispatchEvent(new Event("focus"));
      timers.advance(0);
    });
    await nextFrame();
    expect(polite?.textContent).toBe("fin@acme.example is signed in.");
  });

  it("shows the window's toasts once, over the sidebar and the page, never over the status bar", () => {
    const { container, toasts } = renderFrame();
    act(() => {
      toasts.show({ tone: "success", title: "Saved key for Anthropic" });
    });
    const regions = container.querySelectorAll('section[aria-label="Notifications"]');
    expect(regions).toHaveLength(1);
    const region = regions[0] as HTMLElement;
    expect(region.textContent).toContain("Saved key for Anthropic");
    expect(region.parentElement?.className).toContain("relative");
    expect(region.parentElement?.querySelector("main")).not.toBeNull();
    expect(region.closest("footer")).toBeNull();
  });

  it("keeps the toasts on a phone, over the page", () => {
    const { container, toasts } = renderFrame();
    act(() => media.resize(400));
    act(() => {
      toasts.show({ tone: "info", title: "This was removed on your computer." });
    });
    const region = container.querySelector('section[aria-label="Notifications"]');
    expect(region?.textContent).toContain("This was removed on your computer.");
    expect(region?.parentElement?.querySelector("main")).not.toBeNull();
  });
});

/** An executor connection the test moves by hand, like a remote executor's. */
function handMovedConnection(initial: EngineConnectionState) {
  const listeners = new Set<(next: EngineConnectionState) => void>();
  let state = initial;
  const connection: EngineConnection & { set(next: EngineConnectionState): void } = {
    get state() {
      return state;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      state = next;
      for (const listener of listeners) {
        listener(next);
      }
    },
  };
  return connection;
}

verifies("shell.engine-line", () => {
  const lineText = "The engine isn't answering. Showing what it said last.";

  it("shows one line under the toolbar while the engine isn't answering, and drops it when it's back", () => {
    const { container, engine } = renderFrame();
    const connection = handMovedConnection("connected");
    act(() => {
      engine.watch({ connection });
    });
    expect(container.textContent).not.toContain(lineText);
    act(() => connection.set("lost"));
    const toolbar = container.querySelector('[data-layout="desktop"] > div')?.firstElementChild;
    const line = toolbar?.nextElementSibling;
    expect(line?.textContent).toBe(lineText);
    expect(line?.closest("[aria-live]")).toBeNull();
    expect(line?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    act(() => connection.set("connected"));
    expect(container.textContent).not.toContain(lineText);
  });

  it("shows no line for an engine that never answered", () => {
    const { container, engine } = renderFrame();
    act(() => {
      engine.watch({ connection: handMovedConnection("lost") });
    });
    expect(container.textContent).not.toContain(lineText);
  });

  it("puts the line at the top on a phone", () => {
    const { container, engine } = renderFrame();
    const connection = handMovedConnection("connected");
    act(() => {
      engine.watch({ connection });
      media.resize(400);
    });
    act(() => connection.set("lost"));
    const panel = container.querySelector('[data-layout="phone"] > div');
    expect(panel?.firstElementChild?.textContent).toBe(lineText);
  });
});
