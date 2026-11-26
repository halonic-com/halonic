// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, expect, it } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { useInputModality } from "./frame-effects.ts";

afterEach(unmountAll);

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

  it("drops the mark when the window goes", () => {
    render(<Marks />);
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));

    unmountAll();
    expect(marked()).toBeNull();
  });
});
