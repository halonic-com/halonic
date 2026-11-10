// @vitest-environment jsdom

import { Dialog, usePresentation } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createAnnouncer } from "../announcer/announcer.ts";
import { createCloseStack } from "../close-stack/close-stack.ts";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { FakeTimers } from "../test-support/fake-timers.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ShellFrame } from "./shell-frame.tsx";

let media: FakeMediaQueries;
let uninstall: () => void;

beforeEach(() => {
  media = new FakeMediaQueries(1440);
  uninstall = media.install();
});

afterEach(() => {
  unmountAll();
  uninstall();
});

function ShowPresentation() {
  return <p>{usePresentation()}</p>;
}

function renderFrame(page = <ShowPresentation />) {
  const timers = new FakeTimers();
  const announcer = createAnnouncer({ timers });
  const closeStack = createCloseStack();
  const container = render(
    <ShellFrame
      announcer={announcer}
      closeStack={closeStack}
      language="en"
      toolbar={<button type="button">Back</button>}
      statusBar="1 error"
    >
      {page}
    </ShellFrame>,
  );
  return { container, timers, announcer, closeStack };
}

function pressEscape(target: Element): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function nextFrame(): Promise<void> {
  return act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

verifies("shell.frame", () => {
  it("shows the title bar, the toolbar, the page and the status bar on the desktop", () => {
    const { container } = renderFrame();
    const frame = container.querySelector('[data-layout="desktop"]') as HTMLElement;
    const [titleBar, panel, statusBar] = Array.from(frame.children);
    expect(titleBar?.tagName).toBe("HEADER");
    expect(titleBar?.className).toContain("h-10");
    expect(panel?.firstElementChild?.textContent).toBe("Back");
    expect(panel?.querySelector("main")?.textContent).toBe("desktop");
    expect(statusBar?.tagName).toBe("FOOTER");
    expect(statusBar?.className).toContain("h-6");
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
    // jsdom has <dialog> but no showModal(); opening it is all this test needs.
    const prototype = HTMLDialogElement.prototype;
    prototype.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    };
    prototype.close = function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
    };
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
});
