// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { ReachingLine } from "./first-reach.tsx";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 22, 10, 42, 10));
});

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

/** The wait started 10 seconds ago. */
const since = () => new Date(Date.now() - 10_000);

function show(heldAt?: Date) {
  return render(
    <ReachingLine
      computer="Tim's laptop"
      since={since()}
      heldAt={heldAt}
      onSomethingWrong={() => undefined}
    />,
  );
}

verifies("remote.phone-first-reach", () => {
  it("counts the seconds while the wait goes on", () => {
    const container = show();
    act(() => vi.advanceTimersByTime(5_000));
    expect(container.textContent).toContain("15 s");
  });

  it("stands the seconds still while the wait holds, so they don't jump back when it goes on", () => {
    const container = show(new Date());
    act(() => vi.advanceTimersByTime(60_000));
    expect(container.textContent).toContain("10 s");
    expect(container.textContent).not.toContain("70 s");
  });
});
