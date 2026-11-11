// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { PanelWidthProvider } from "../panels/panel-width-context.tsx";
import { installFakePopover } from "../test-support/fake-popover.ts";
import { FakeResizeObserver } from "../test-support/fake-resize-observer.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { ItemPage, type ItemPageChat } from "./item-page.tsx";

let uninstallPopover: () => void;
let uninstallResizeObserver: () => void;

beforeEach(() => {
  uninstallPopover = installFakePopover();
  uninstallResizeObserver = FakeResizeObserver.install(1600);
});

afterEach(() => {
  unmountAll();
  uninstallPopover();
  uninstallResizeObserver();
});

function chat(startsOpen = true): ItemPageChat {
  return { startsOpen, render: () => <p>Chat</p> };
}

function Item({ name, itemChat }: { readonly name: string; readonly itemChat?: ItemPageChat }) {
  return (
    <ItemPage
      icon={<svg />}
      kind="Agent"
      name={name}
      onRename={() => {}}
      views={[{ id: "flow", label: "Flow" }]}
      chat={itemChat}
    >
      {() => <p>Flow view</p>}
    </ItemPage>
  );
}

/** Two agent pages in one window, recording each width saved on this computer. */
function renderPages(saved: unknown = undefined) {
  const saves: number[] = [];
  const container = render(
    <PanelWidthProvider saved={saved} onSave={(width) => saves.push(width)}>
      <div data-page="refund">
        <Item name="Refund checker" itemChat={chat()} />
      </div>
      <div data-page="triage">
        <Item name="Triage" itemChat={chat()} />
      </div>
    </PanelWidthProvider>,
  );
  const edge = (page: string) =>
    container.querySelector<HTMLElement>(`[data-page="${page}"] [role="separator"]`) as HTMLElement;
  const panelWidth = (page: string) => {
    const panel = document.getElementById(edge(page).getAttribute("aria-controls") ?? "");
    return panel?.style.width;
  };
  return { container, edge, panelWidth, saves };
}

function press(edge: HTMLElement, key: string) {
  act(() => {
    edge.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    edge.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
  });
}

function pointer(edge: HTMLElement, type: string, clientX: number) {
  act(() => {
    edge.dispatchEvent(new MouseEvent(type, { clientX, button: 0, bubbles: true }));
  });
}

verifies("shell.panel-width", () => {
  it("puts a separator named Resize panel on the panel's left edge, its width as the value", () => {
    const { edge, panelWidth } = renderPages();

    expect(edge("refund").tabIndex).toBe(0);
    expect(edge("refund").getAttribute("aria-label")).toBe("Resize panel");
    expect(edge("refund").getAttribute("aria-orientation")).toBe("vertical");
    expect(edge("refund").getAttribute("aria-valuemin")).toBe("420");
    // In a 1600px tab the chat keeps 320px: 1600 - 40 - 320 - 48.
    expect(edge("refund").getAttribute("aria-valuemax")).toBe("1192");
    expect(edge("refund").getAttribute("aria-valuetext")).toBe("700 pixels");
    expect(panelWidth("refund")).toBe("700px");
  });

  it("widens with ←, narrows with →, and saves when the key is released", () => {
    const { edge, saves } = renderPages();

    press(edge("refund"), "ArrowLeft");
    expect(edge("refund").getAttribute("aria-valuenow")).toBe("716");
    press(edge("refund"), "ArrowRight");
    press(edge("refund"), "ArrowRight");
    expect(edge("refund").getAttribute("aria-valuenow")).toBe("684");
    expect(saves).toEqual([716, 700, 684]);
  });

  it("goes to 420px with Home, as wide as the tab allows with End, and 700px with Enter", () => {
    const { edge, saves } = renderPages(812);

    press(edge("refund"), "Home");
    expect(edge("refund").getAttribute("aria-valuenow")).toBe("420");
    press(edge("refund"), "End");
    expect(edge("refund").getAttribute("aria-valuenow")).toBe("1192");
    press(edge("refund"), "Enter");
    expect(edge("refund").getAttribute("aria-valuenow")).toBe("700");
    expect(saves).toEqual([420, 1192, 700]);
  });

  it("follows a drag to the left, saves on release, and goes back to 700px on a double-click", () => {
    const { edge, saves } = renderPages();

    pointer(edge("refund"), "pointerdown", 900);
    pointer(edge("refund"), "pointermove", 800);
    expect(edge("refund").getAttribute("aria-valuenow")).toBe("800");
    pointer(edge("refund"), "pointerup", 800);
    act(() => {
      edge("refund").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });

    expect(edge("refund").getAttribute("aria-valuenow")).toBe("700");
    expect(saves).toEqual([800, 700]);
  });

  it("gives the width to every item page in the window", () => {
    const { edge, panelWidth } = renderPages();

    press(edge("refund"), "ArrowLeft");

    expect(panelWidth("triage")).toBe("716px");
  });

  it("starts at the saved width, or 700px when what was saved isn't a number", () => {
    expect(renderPages(812).panelWidth("refund")).toBe("812px");
    unmountAll();
    expect(renderPages("812px").panelWidth("refund")).toBe("700px");
  });

  it("shows no edge without a panel beside the chat", () => {
    const closedChat = render(<Item name="Refund checker" itemChat={chat(false)} />);
    const noChat = render(<Item name="Refund checker" />);
    FakeResizeObserver.resize(800);
    const narrow = render(<Item name="Refund checker" itemChat={chat()} />);

    for (const container of [closedChat, noChat, narrow]) {
      expect(container.querySelector('[role="separator"]')).toBeNull();
    }
  });

  it("shows no edge once the panel is closed with its ✕", () => {
    const { container, edge } = renderPages();

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-page="refund"] button[aria-label="Close Flow"]')
        ?.click();
    });

    expect(container.querySelector('[data-page="refund"] [role="separator"]')).toBeNull();
    expect(edge("triage")).not.toBeNull();
  });

  it("saves through the host's latest onSave, which may be a new function each render", () => {
    const saves: string[] = [];
    function Host() {
      const [round, setRound] = useState(1);
      return (
        <PanelWidthProvider
          saved={undefined}
          onSave={(width) => {
            saves.push(`${round}:${width}`);
            setRound(round + 1);
          }}
        >
          <Item name="Refund checker" itemChat={chat()} />
        </PanelWidthProvider>
      );
    }
    const container = render(<Host />);
    const edge = container.querySelector('[role="separator"]') as HTMLElement;

    press(edge, "ArrowLeft");
    press(edge, "ArrowLeft");

    expect(saves).toEqual(["1:716", "2:732"]);
  });
});
