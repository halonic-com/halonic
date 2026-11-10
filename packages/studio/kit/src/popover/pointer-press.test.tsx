// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test/render.tsx";
import { type PointerPress, usePointerPress } from "./pointer-press.ts";

afterEach(unmountAll);

/** Renders a component that follows the presses, and hands back what it follows them with. */
function renderPress(): PointerPress {
  let press: PointerPress | undefined;
  function Follower() {
    press = usePointerPress();
    return null;
  }
  render(<Follower />);
  if (press === undefined) {
    throw new Error("The follower didn't render.");
  }
  return press;
}

function fire(target: EventTarget, type: string): void {
  act(() => {
    target.dispatchEvent(new Event(type, { bubbles: true }));
  });
}

async function nextTask(): Promise<void> {
  await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
}

verifies("kit.context-menu", () => {
  it("runs at once while nothing is held", () => {
    const press = renderPress();
    const run = vi.fn();
    press.afterRelease(run);
    expect(press.held()).toBe(false);
    expect(run).toHaveBeenCalledOnce();
  });

  it("runs a task after the release of a held press, or of a cancelled one", async () => {
    for (const release of ["pointerup", "pointercancel"]) {
      const press = renderPress();
      const run = vi.fn();
      fire(document.body, "pointerdown");
      expect(press.held()).toBe(true);
      press.afterRelease(run);
      fire(document.body, release);
      expect(run).not.toHaveBeenCalled();
      await nextTask();
      expect(run).toHaveBeenCalledOnce();
      unmountAll();
    }
  });

  it("counts the window losing the focus as a release", async () => {
    const press = renderPress();
    const run = vi.fn();
    fire(document.body, "pointerdown");
    press.afterRelease(run);
    fire(window, "blur");
    await nextTask();
    expect(run).toHaveBeenCalledOnce();
  });

  it("doesn't run once cancelled, before or after the release, or after an unmount", async () => {
    const press = renderPress();
    const beforeRelease = vi.fn();
    const afterRelease = vi.fn();
    fire(document.body, "pointerdown");
    press.afterRelease(beforeRelease)();
    fire(document.body, "pointerup");
    fire(document.body, "pointerdown");
    const cancel = press.afterRelease(afterRelease);
    fire(document.body, "pointerup");
    cancel();
    await nextTask();
    expect(beforeRelease).not.toHaveBeenCalled();
    expect(afterRelease).not.toHaveBeenCalled();

    const unmounted = vi.fn();
    fire(document.body, "pointerdown");
    press.afterRelease(unmounted);
    unmountAll();
    expect(press.held()).toBe(false);
    fire(document.body, "pointerup");
    await nextTask();
    expect(unmounted).not.toHaveBeenCalled();
  });
});
