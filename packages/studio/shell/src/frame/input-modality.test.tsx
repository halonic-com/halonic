// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { useInputModality } from "./frame-effects.ts";

afterEach(() => {
  unmountAll();
  // The mark outlives every frame by design, so each test starts without one.
  document.documentElement.removeAttribute("data-input");
});

function Marks() {
  useInputModality();
  return <h1 tabIndex={-1}>Inbox</h1>;
}

const marked = () => document.documentElement.getAttribute("data-input");

verifies("shell.focus-ring-after-pointer", () => {
  it("marks the window pointer after a press and keyboard after a key", () => {
    render(<Marks />);
    expect(marked()).toBeNull();

    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(marked()).toBe("pointer");

    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(marked()).toBe("keyboard");
  });

  // Open demo swaps Welcome's frame for the workspace's: the press must still count there.
  it("keeps the mark when one frame goes and another comes", () => {
    render(<Marks />);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    unmountAll();
    render(<Marks />);
    expect(marked()).toBe("pointer");
  });

  it("stays pointer after a modifier pressed alone", () => {
    render(<Marks />);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    for (const key of ["Meta", "Shift", "Control", "Alt"]) {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    }
    expect(marked()).toBe("pointer");
  });
});
