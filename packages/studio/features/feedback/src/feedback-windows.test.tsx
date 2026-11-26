// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type MountedFeedbackWindow, mountFeedbackWindow } from "./feedback-windows.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** An overlay window of 100 × 50 CSS pixels on a screen at scale 2, so its still is 200 × 100. */
const viewport = { width: 100, height: 50 };
const still = { width: 200, height: 100 };

/** The shell's answer to `plugin:feedback|still`: the size as two little-endian u32s, then RGBA. */
function stillBytes(): ArrayBuffer {
  const bytes = new Uint8Array(8 + still.width * still.height * 4);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, still.width, true);
  header.setUint32(4, still.height, true);
  bytes.fill(7, 8);
  return bytes.buffer;
}

function fakeShell() {
  return {
    invoke: vi.fn(async (command: string, _args?: Record<string, unknown>): Promise<unknown> => {
      if (command === "plugin:feedback|still") return stillBytes();
      return null;
    }),
  };
}

/** jsdom draws nothing: the canvas's context only records what the page draws. */
const drawn = vi.fn();
const canvasPrototype = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
let mounted: MountedFeedbackWindow | undefined;
let element: HTMLDivElement;

beforeEach(() => {
  Object.assign(window, { innerWidth: viewport.width, innerHeight: viewport.height });
  canvasPrototype["getContext"] = () => ({
    createImageData: (width: number, height: number) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    }),
    putImageData: drawn,
  });
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(() => {
  act(() => mounted?.unmount());
  mounted = undefined;
  element.remove();
  delete canvasPrototype["getContext"];
  drawn.mockReset();
});

async function mount(kind: "overlay" | "unavailable", shell = fakeShell()) {
  await act(async () => {
    mounted = mountFeedbackWindow(element, kind, shell);
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
  it("draws the screen's still at its own size, dimmed, with the hint", async () => {
    await mount("overlay");
    await vi.waitFor(() => expect(drawn).toHaveBeenCalled());
    const canvas = element.querySelector("canvas");
    expect([canvas?.width, canvas?.height]).toEqual([still.width, still.height]);
    const [image] = drawn.mock.calls[0] ?? [];
    expect(image.width).toBe(still.width);
    expect(image.data[0]).toBe(7);
    expect(overlay().className).toContain("cursor-crosshair");
    expect(overlay().innerHTML).toContain("rgba(0, 0, 0, 0.4)");
    expect(hintText()).toBe("Drag to select an area · Enter for the whole screen · Esc to cancel");
  });

  it("selects the whole screen on Enter", async () => {
    const shell = await mount("overlay");
    await vi.waitFor(() => expect(drawn).toHaveBeenCalled());
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" })));
    expect(selected(shell)).toEqual([
      ["plugin:feedback|select", { area: { left: 0, top: 0, width: 200, height: 100 } }],
    ]);
  });

  it("draws a box with a click, a move and a second click, without dragging", async () => {
    const shell = await mount("overlay");
    await vi.waitFor(() => expect(drawn).toHaveBeenCalled());
    click(10, 10);
    act(() => pointer("pointermove", 18, 18));
    expect(element.querySelector("[data-feedback-size]")?.textContent).toBe("16 × 16");
    expect(hintText()).toBeUndefined();
    click(18, 18);
    expect(selected(shell)).toEqual([
      ["plugin:feedback|select", { area: { left: 20, top: 20, width: 16, height: 16 } }],
    ]);
  });

  it("ends the feedback on Esc", async () => {
    const shell = await mount("overlay");
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    expect(shell.invoke).toHaveBeenCalledWith("plugin:feedback|end");
  });

  it("selects a box of 8 × 8 or more in the still's device pixels, with its size beside it", async () => {
    const shell = await mount("overlay");
    await vi.waitFor(() => expect(drawn).toHaveBeenCalled());
    dragFrom([10, 10], [18, 18]);
    expect(element.querySelector("[data-feedback-box]")).not.toBeNull();
    expect(element.querySelector("[data-feedback-size]")?.textContent).toBe("16 × 16");
    expect(element.textContent).not.toContain("Drag to select an area");
    act(() => pointer("pointerup", 18, 18));
    expect(selected(shell)).toEqual([
      ["plugin:feedback|select", { area: { left: 20, top: 20, width: 16, height: 16 } }],
    ]);
  });

  it("does nothing on a box under 8 × 8, dragged or clicked, and stays open", async () => {
    const shell = await mount("overlay");
    await vi.waitFor(() => expect(drawn).toHaveBeenCalled());
    click(30, 30);
    click(33, 60);
    dragFrom([10, 10], [17, 40]);
    act(() => pointer("pointerup", 17, 40));
    expect(selected(shell)).toEqual([]);
    expect(shell.invoke).not.toHaveBeenCalledWith("plugin:feedback|end");
    expect(element.querySelector("[data-feedback-box]")).toBeNull();
    expect(element.textContent).toContain("Drag to select an area");
  });

  it("ends the feedback when its still is gone", async () => {
    const shell = fakeShell();
    shell.invoke.mockImplementation(async (command: string) => {
      if (command === "plugin:feedback|still") throw "gone";
      return null;
    });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await mount("overlay", shell);
    await vi.waitFor(() => expect(shell.invoke).toHaveBeenCalledWith("plugin:feedback|end"));
    expect(drawn).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

verifies("feedback.unavailable", () => {
  it("says capture isn't available here, and Not now or Esc closes it", async () => {
    const shell = await mount("unavailable");
    expect(element.textContent).toContain(
      "Studio can't take a screenshot for feedback on this system yet.",
    );
    const notNow = [...element.querySelectorAll("button")].find(
      (button) => button.textContent === "Not now",
    );
    act(() => notNow?.click());
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    const ends = shell.invoke.mock.calls.filter(([command]) => command === "plugin:feedback|end");
    expect(ends).toHaveLength(2);
    expect(shell.invoke).not.toHaveBeenCalledWith("plugin:feedback|still");
  });
});
