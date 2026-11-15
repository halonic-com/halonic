// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { show, unmount } from "../test-support.tsx";
import { PointOfLight } from "./point-of-light.tsx";

/** One root that is drawn again with a new target, as the canvas does when the active step changes. */
async function mount() {
  const element = document.createElement("div");
  document.body.append(element);
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(element);
  return {
    element,
    render: (target: { x: number; y: number }, reducedMotion: boolean) =>
      act(async () =>
        root.render(<PointOfLight target={target} color="blue" reducedMotion={reducedMotion} />),
      ),
    done: () => {
      act(() => root.unmount());
      element.remove();
    },
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

verifies("workflows.canvas.point-of-light-rest", () => {
  it("draws nothing without an active step", async () => {
    const page = await show(<PointOfLight target={undefined} color="blue" />);
    expect(page.querySelector("[data-testid=point-of-light]")).toBeNull();
  });

  it("draws one light, hidden from assistive technology and taking no clicks", async () => {
    const page = await show(<PointOfLight target={{ x: 10, y: 20 }} color="blue" />);
    const lights = page.querySelectorAll("[data-testid=point-of-light]");
    expect(lights).toHaveLength(1);
    expect(lights[0]?.getAttribute("aria-hidden")).toBe("true");
    expect(lights[0]?.className).toContain("pointer-events-none");
  });

  it("flies to a new target with the same single light", async () => {
    const { element, render, done } = await mount();
    await render({ x: 0, y: 0 }, false);
    await render({ x: 120, y: 0 }, false);
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(element.querySelectorAll("[data-testid=point-of-light]")).toHaveLength(1);
    done();
  });

  it("cross-fades under reduced motion and does not travel", async () => {
    const { element, render, done } = await mount();
    await render({ x: 0, y: 0 }, true);
    await render({ x: 120, y: 0 }, true);
    const lights = element.querySelectorAll<HTMLElement>("[data-testid=point-of-light]");
    expect(lights).toHaveLength(2);
    expect(lights[0]?.style.transform).toBe("translate(0px, 0px)");
    expect(lights[1]?.style.transform).toBe("translate(120px, 0px)");
    expect(lights[0]?.style.transition).toContain("120ms");
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(element.querySelectorAll("[data-testid=point-of-light]")).toHaveLength(1);
    done();
  });
});
