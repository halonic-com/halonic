// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import type { PhoneState } from "./phone-status.ts";
import { PhoneStatusHeader } from "./status-header.tsx";

let nowMs = 0;
const clock = () => nowMs;

beforeEach(() => {
  vi.useFakeTimers();
  nowMs = 0;
});

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

interface Shown {
  readonly state: PhoneState;
  readonly computer: string;
}

/** Shows the header and gives the test a way to change what the connection says. */
function mount(state: PhoneState, onOpen = vi.fn()) {
  let set: (next: Shown) => void = () => {};
  function Page() {
    const [shown, setShown] = useState<Shown>({ state, computer: "Tim's laptop" });
    set = setShown;
    return (
      <PhoneStatusHeader
        state={shown.state}
        computer={shown.computer}
        onOpen={onOpen}
        clock={clock}
      />
    );
  }
  const container = render(<Page />);
  return {
    button: () => container.querySelector("button") as HTMLButtonElement,
    said: () => container.querySelector('[role="status"]')?.textContent ?? "",
    change: (next: PhoneState, computer = "Tim's laptop") => {
      act(() => set({ state: next, computer }));
    },
  };
}

const advance = (ms: number) => {
  nowMs += ms;
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

verifies("remote.phone-status", () => {
  it("shows the state in words, named with Details, and says nothing for the first state", () => {
    const view = mount("connected");
    expect(view.button().textContent).toBe("Connected · Tim's laptop");
    expect(view.button().getAttribute("aria-label")).toBe("Connected to Tim's laptop. Details");
    expect(view.said()).toBe("");
  });

  it("says Reconnecting only once it has lasted 2 seconds, then Connected when it's back", () => {
    const view = mount("connected");
    view.change("reconnecting");
    expect(view.button().textContent).toBe("Reconnecting…");
    advance(1500);
    expect(view.said()).toBe("");
    advance(500);
    expect(view.said()).toBe("Reconnecting");
    view.change("connected");
    expect(view.said()).toBe("Connected to Tim's laptop");
  });

  it("says nothing either way for a blip under 2 seconds", () => {
    const view = mount("connected");
    view.change("reconnecting");
    advance(1000);
    view.change("connected");
    advance(5000);
    expect(view.said()).toBe("");
  });

  it("keeps Can't reach through a background retry, and says trouble at once", () => {
    const view = mount("connected");
    view.change("unreachable");
    expect(view.said()).toBe("Tim's laptop isn't answering");
    view.change("reconnecting");
    advance(5000);
    expect(view.button().textContent).toBe("Tim's laptop isn't answering");
    expect(view.said()).toBe("Tim's laptop isn't answering");
    view.change("removed");
    expect(view.said()).toBe("Removed from your computer");
    expect(view.button().getAttribute("aria-label")).toBe("Removed from your computer. Details");
  });

  it("keeps the live region outside the button, so tapping the label doesn't read it", () => {
    const onOpen = vi.fn();
    const view = mount("cantConfirm", onOpen);
    expect(view.button().querySelector('[role="status"]')).toBeNull();
    act(() => view.button().click());
    expect(onOpen).toHaveBeenCalledWith("cantConfirm");
  });

  it("starts again for another computer, so its first state says nothing", () => {
    const view = mount("connected");
    view.change("unreachable");
    expect(view.said()).toBe("Tim's laptop isn't answering");
    view.change("unreachable", "Studio PC");
    expect(view.button().textContent).toBe("Studio PC isn't answering");
    expect(view.said()).toBe("");
  });
});
