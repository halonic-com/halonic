// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { FakeMediaQueries } from "../test-support/fake-media-query.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { SidebarResizeEdge } from "./sidebar-resize-edge.tsx";
import { sidebarWidthForKey } from "./sidebar-width.ts";

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

/** The edge beside a sidebar that follows it, recording each width it saved. */
function renderEdge(startWidth = 264) {
  const saved: number[] = [];
  function Sidebar() {
    const [width, setWidth] = useState(startWidth);
    return (
      <>
        <nav id="places" style={{ width }} />
        <SidebarResizeEdge
          width={width}
          sidebarId="places"
          onResize={setWidth}
          onResizeEnd={(end) => saved.push(end)}
        />
      </>
    );
  }
  const container = render(<Sidebar />);
  const edge = container.querySelector<HTMLElement>('[role="separator"]') as HTMLElement;
  return { edge, saved };
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

verifies("shell.sidebar-resize", () => {
  it("is a focusable vertical separator named Resize sidebar, with its width as the value", () => {
    const { edge } = renderEdge();

    expect(edge.tabIndex).toBe(0);
    expect(edge.getAttribute("aria-label")).toBe("Resize sidebar");
    expect(edge.getAttribute("aria-orientation")).toBe("vertical");
    expect(edge.getAttribute("aria-controls")).toBe("places");
    expect(edge.getAttribute("aria-valuemin")).toBe("180");
    expect(edge.getAttribute("aria-valuemax")).toBe("640");
    expect(edge.getAttribute("aria-valuenow")).toBe("264");
    expect(edge.getAttribute("aria-valuetext")).toBe("264 pixels");
  });

  it("moves 16px with ← and →, and saves the width when the key is released", () => {
    const { edge, saved } = renderEdge();

    press(edge, "ArrowRight");
    expect(edge.getAttribute("aria-valuenow")).toBe("280");
    press(edge, "ArrowLeft");
    press(edge, "ArrowLeft");
    expect(edge.getAttribute("aria-valuetext")).toBe("248 pixels");
    expect(saved).toEqual([280, 264, 248]);
  });

  it("goes to 180px with Home, 640px with End, and back to 264px with Enter", () => {
    const { edge, saved } = renderEdge(400);

    press(edge, "Home");
    expect(edge.getAttribute("aria-valuenow")).toBe("180");
    press(edge, "End");
    expect(edge.getAttribute("aria-valuenow")).toBe("640");
    press(edge, "Enter");
    expect(edge.getAttribute("aria-valuenow")).toBe("264");
    expect(saved).toEqual([180, 640, 264]);
  });

  it("stops at 180px and 640px, with no wrap", () => {
    expect(sidebarWidthForKey("ArrowLeft", 188)).toBe(180);
    expect(sidebarWidthForKey("ArrowLeft", 180)).toBe(180);
    expect(sidebarWidthForKey("ArrowRight", 632)).toBe(640);
    expect(sidebarWidthForKey("ArrowRight", 640)).toBe(640);
  });

  it("leaves other keys alone and saves nothing for them", () => {
    const { edge, saved } = renderEdge();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });

    act(() => {
      edge.dispatchEvent(tab);
    });
    expect(tab.defaultPrevented).toBe(false);
    expect(edge.getAttribute("aria-valuenow")).toBe("264");
    expect(saved).toEqual([]);
  });

  it("leaves the keys with a modifier to the browser and the keybindings", () => {
    const { edge, saved } = renderEdge();
    for (const modifier of ["altKey", "ctrlKey", "metaKey", "shiftKey"] as const) {
      const down = new KeyboardEvent("keydown", {
        key: "ArrowRight",
        [modifier]: true,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        edge.dispatchEvent(down);
        edge.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowRight", bubbles: true }));
      });
      expect(down.defaultPrevented).toBe(false);
    }
    expect(edge.getAttribute("aria-valuenow")).toBe("264");
    expect(saved).toEqual([]);
  });

  it("saves only on the release of a key that changed the width here", () => {
    const { edge, saved } = renderEdge(180);

    act(() => {
      edge.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", bubbles: true }));
    });
    press(edge, "ArrowLeft");
    press(edge, "Home");
    expect(saved).toEqual([]);
  });

  it("follows a drag, kept within 180 to 640px, and saves when the pointer is released", () => {
    const { edge, saved } = renderEdge();

    pointer(edge, "pointerdown", 264);
    pointer(edge, "pointermove", 300);
    expect(edge.getAttribute("aria-valuenow")).toBe("300");
    expect(edge.hasAttribute("data-dragging")).toBe(true);
    pointer(edge, "pointermove", 900);
    expect(edge.getAttribute("aria-valuenow")).toBe("640");
    expect(saved).toEqual([]);

    pointer(edge, "pointerup", 900);
    expect(saved).toEqual([640]);
    expect(edge.hasAttribute("data-dragging")).toBe(false);
  });

  it("ignores pointer moves when no drag started", () => {
    const { edge, saved } = renderEdge();

    pointer(edge, "pointermove", 400);
    pointer(edge, "pointerup", 400);
    expect(edge.getAttribute("aria-valuenow")).toBe("264");
    expect(saved).toEqual([]);
  });

  it("goes back to 264px on a double-click, and saves it once", () => {
    const { edge, saved } = renderEdge(500);

    for (const _click of [1, 2]) {
      pointer(edge, "pointerdown", 500);
      pointer(edge, "pointerup", 500);
    }
    act(() => {
      edge.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(edge.getAttribute("aria-valuenow")).toBe("264");
    expect(saved).toEqual([264]);
  });

  it("saves nothing on a double-click when the sidebar is already 264px", () => {
    const { edge, saved } = renderEdge(264);

    act(() => {
      edge.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(edge.getAttribute("aria-valuenow")).toBe("264");
    expect(saved).toEqual([]);
  });

  it("draws its accent line only on hover, keyboard focus and while dragging", () => {
    const { edge } = renderEdge();
    const line = edge.firstElementChild as HTMLElement;

    expect(line.className).toContain("w-0.5 bg-accent opacity-0");
    expect(line.className).toContain("group-hover:opacity-100");
    expect(line.className).toContain("group-focus-visible:opacity-100");
    expect(line.className).toContain("group-data-dragging:opacity-100");
    expect(line.className).toContain("forced-colors:bg-[Highlight]");
  });

  it("isn't there in a narrow window, where the sidebar is the 264px drawer, and comes back wider", () => {
    renderEdge();
    act(() => media.resize(800));
    expect(document.querySelector('[role="separator"]')).toBeNull();

    act(() => media.resize(1024));
    expect(document.querySelector('[role="separator"]')).not.toBeNull();
  });
});
