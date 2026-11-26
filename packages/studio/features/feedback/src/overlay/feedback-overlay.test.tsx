// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FeedbackOverlay } from "./feedback-overlay.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A window of 100 × 50 CSS pixels at scale 2, so the shell's still of it is 200 × 100. */
const viewport = { width: 100, height: 50 };
const still = { width: 200, height: 100 };

function fakeShell(selecting: () => Promise<unknown> = async () => null) {
  return {
    invoke: vi.fn(
      async (command: string, _args?: Record<string, unknown>): Promise<unknown> =>
        command === "plugin:feedback|select" ? selecting() : null,
    ),
  };
}

let root: Root | undefined;
let element: HTMLDivElement;
const closed = vi.fn();
const kept = vi.fn();

beforeEach(() => {
  Object.assign(window, { innerWidth: viewport.width, innerHeight: viewport.height });
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  element.remove();
  closed.mockReset();
  kept.mockReset();
});

async function mount(shell = fakeShell()) {
  await act(async () => {
    root = createRoot(element);
    root.render(<FeedbackOverlay ipc={shell} still={still} onClose={closed} onSelected={kept} />);
  });
  return shell;
}

function overlay(): HTMLElement {
  const found = element.querySelector<HTMLElement>("[data-feedback-overlay]");
  if (found === null) throw new Error("No overlay.");
  return found;
}

/** A pointer event; React reads only its type, button and position. */
function pointer(type: string, x: number, y: number) {
  overlay().dispatchEvent(
    new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y }),
  );
}

function dragFrom(start: [number, number], end: [number, number]) {
  act(() => pointer("pointerdown", ...start));
  act(() => pointer("pointermove", ...end));
}

function click(x: number, y: number) {
  act(() => pointer("pointerdown", x, y));
  act(() => pointer("pointerup", x, y));
}

/** The hint's parts as a person reads them, one space apart. */
function hintText(): string | undefined {
  const hint = element.querySelector("[data-feedback-hint]");
  if (hint === null) return undefined;
  return [...hint.children].map((part) => part.textContent).join(" ");
}

function selected(shell: ReturnType<typeof fakeShell>) {
  return shell.invoke.mock.calls.filter(([command]) => command === "plugin:feedback|select");
}

verifies("feedback.overlay", () => {
  it("shows a see-through dim over the live window, with the hint", async () => {
    await mount();
    expect(element.querySelector("canvas")).toBeNull();
    expect(overlay().getAttribute("style") ?? "").not.toContain("background");
    expect(overlay().className).toContain("cursor-crosshair");
    expect(overlay().innerHTML).toContain("rgba(0, 0, 0, 0.25)");
    expect(hintText()).toBe("Drag to select an area · Enter for the whole window · Esc to cancel");
  });

  it("selects the whole window on Enter, closes, and says so once the shell kept the crop", async () => {
    const shell = await mount();
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })));
    expect(selected(shell)).toEqual([
      ["plugin:feedback|select", { area: { left: 0, top: 0, width: 200, height: 100 } }],
    ]);
    expect(closed).toHaveBeenCalled();
    expect(kept).toHaveBeenCalledOnce();
  });

  it("ends the feedback when the shell refuses the box, unless another window's press took the still", async () => {
    const gone = await mount(fakeShell(() => Promise.reject("gone")));
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })));
    expect(gone.invoke).toHaveBeenCalledWith("plugin:feedback|end");
    expect(kept).not.toHaveBeenCalled();
    act(() => root?.unmount());
    const otherWindow = await mount(fakeShell(() => Promise.reject("other_window")));
    await act(async () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })));
    expect(selected(otherWindow)).toHaveLength(1);
    expect(otherWindow.invoke).not.toHaveBeenCalledWith("plugin:feedback|end");
    quiet.mockRestore();
  });

  it("draws a box with a click, a move and a second click, without dragging", async () => {
    const shell = await mount();
    click(10, 10);
    act(() => pointer("pointermove", 18, 18));
    expect(element.querySelector("[data-feedback-size]")?.textContent).toBe("16 × 16");
    expect(hintText()).toBeUndefined();
    click(18, 18);
    expect(selected(shell)).toEqual([
      ["plugin:feedback|select", { area: { left: 20, top: 20, width: 16, height: 16 } }],
    ]);
  });

  it("ends the feedback on Esc and closes, without the app under it hearing the key", async () => {
    const shell = await mount();
    const heard = vi.fn();
    document.body.addEventListener("keydown", heard);
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    document.body.removeEventListener("keydown", heard);
    expect(shell.invoke).toHaveBeenCalledWith("plugin:feedback|end");
    expect(closed).toHaveBeenCalled();
    expect(heard).not.toHaveBeenCalled();
  });

  it("selects a box of 8 × 8 or more in the still's device pixels, with its size beside it", async () => {
    const shell = await mount();
    dragFrom([10, 10], [18, 18]);
    expect(element.querySelector("[data-feedback-box]")).not.toBeNull();
    expect(element.querySelector("[data-feedback-size]")?.textContent).toBe("16 × 16");
    expect(element.textContent).not.toContain("Drag to select an area");
    act(() => pointer("pointerup", 18, 18));
    expect(selected(shell)).toEqual([
      ["plugin:feedback|select", { area: { left: 20, top: 20, width: 16, height: 16 } }],
    ]);
  });

  it("keeps the size label and the hint on one line, and lets the hint only fade with reduced motion", async () => {
    await mount();
    // The kit sets --motion-rise to 0 under reduced motion; a fixed translate would still move.
    const hint = [...element.querySelectorAll("p")].find((line) =>
      line.textContent?.startsWith("Drag to select an area"),
    );
    expect(hint?.className).toContain("starting:-translate-y-(--motion-rise)");
    // Centred by its left edge, the hint's width is only the screen's right half: below about
    // 1040 px it would wrap into a pill of several lines (HAL-19089).
    expect(hint?.className.split(" ")).toContain("w-max");
    // Placed by its right edge, the label's width is only what is left of the screen: it must not wrap.
    dragFrom([10, 10], [99, 49]);
    expect(element.querySelector("[data-feedback-size]")?.className).toContain("whitespace-nowrap");
  });

  it("does nothing on a box under 8 × 8, dragged or clicked, and stays open", async () => {
    const shell = await mount();
    click(30, 30);
    click(33, 60);
    dragFrom([10, 10], [17, 40]);
    act(() => pointer("pointerup", 17, 40));
    expect(selected(shell)).toEqual([]);
    expect(shell.invoke).not.toHaveBeenCalledWith("plugin:feedback|end");
    expect(element.querySelector("[data-feedback-box]")).toBeNull();
    expect(element.textContent).toContain("Drag to select an area");
  });

  it("keeps one dim for the overlay's life, so it doesn't flash on a click or while drawing", async () => {
    await mount();
    const dimBefore = element.querySelector("[data-feedback-dim]");
    expect(dimBefore).not.toBeNull();
    act(() => pointer("pointerdown", 30, 30));
    expect(element.querySelector("[data-feedback-dim]")).toBe(dimBefore);
    act(() => pointer("pointerup", 30, 30));
    dragFrom([10, 10], [17, 40]);
    expect(element.querySelector("[data-feedback-dim]")).toBe(dimBefore);
    act(() => pointer("pointerup", 17, 40));
    expect(element.querySelector("[data-feedback-dim]")).toBe(dimBefore);
  });
});
