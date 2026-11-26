// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type MountedFeedbackWindow, mountFeedbackWindow } from "./feedback-windows.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function fakeShell() {
  return { invoke: vi.fn(async (_command: string, _args?: Record<string, unknown>) => null) };
}

let mounted: MountedFeedbackWindow | undefined;
let element: HTMLDivElement;

beforeEach(() => {
  element = document.createElement("div");
  document.body.append(element);
});

afterEach(() => {
  act(() => mounted?.unmount());
  mounted = undefined;
  element.remove();
});

async function mount(kind: "unavailable", shell = fakeShell()) {
  await act(async () => {
    mounted = mountFeedbackWindow(element, { kind }, shell);
  });
  return shell;
}

verifies("feedback.unavailable", () => {
  it("says capture isn't available here, and Not now or Esc closes it", async () => {
    const shell = await mount("unavailable");
    expect(element.textContent).toContain(
      "Studio can't take a screenshot for feedback on this system.",
    );
    const notNow = [...element.querySelectorAll("button")].find(
      (button) => button.textContent === "Not now",
    );
    act(() => notNow?.click());
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
    const ends = shell.invoke.mock.calls.filter(([command]) => command === "plugin:feedback|end");
    expect(ends).toHaveLength(2);
    expect(shell.invoke).not.toHaveBeenCalledWith("plugin:feedback|start");
  });
});
