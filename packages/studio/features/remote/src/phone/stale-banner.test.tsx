// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { StaleBanner, type StaleBannerProps } from "./stale-banner.tsx";

afterEach(unmountAll);

const now = new Date(2026, 10, 22, 14, 5, 0);
const lastUpdate = new Date(2026, 10, 22, 14, 2, 0);

function show(more: Partial<StaleBannerProps> = {}) {
  const actions = { onDetails: vi.fn(), onTryAgain: vi.fn() };
  const container = render(
    <StaleBanner
      kind="unreachable"
      computer="Tim's laptop"
      asOf={lastUpdate}
      now={now}
      {...actions}
      {...more}
    />,
  );
  const section = container.querySelector("section") as HTMLElement;
  const buttons = [...section.querySelectorAll("button")];
  return { section, buttons, ...actions, ...more };
}

const textOf = (section: HTMLElement) =>
  [...section.querySelectorAll("p")].map((p) => p.textContent);

verifies("remote.phone-stale-banner", () => {
  it("names the computer that isn't answering and when the last update came", () => {
    const { section } = show();
    expect(textOf(section)).toEqual([
      "Tim's laptop isn't answering",
      "Last update 14:02. If your computer is on, your agents there keep running.",
    ]);
    const title = section.querySelector("p") as HTMLElement;
    expect(section.getAttribute("aria-labelledby")).toBe(title.id);
    expect(section.querySelector('[role="status"], [aria-live]')).toBeNull();
  });

  it("names the phone's own cause, and leaves out the last update before anything arrived", () => {
    const tailscale = show({ kind: "tailscaleOff", asOf: undefined });
    expect(textOf(tailscale.section)).toEqual([
      "Tailscale is off on this phone",
      "If your computer is on, your agents there keep running.",
    ]);
    unmountAll();
    expect(textOf(show({ kind: "nearbyOff" }).section)[0]).toBe(
      "Nearby devices isn't allowed for Halonic",
    );
    unmountAll();
    expect(textOf(show({ kind: "phoneOffline" }).section)[0]).toBe("Your phone is offline");
  });

  it("opens the details and tries again, busy while a try is under way", () => {
    const view = show();
    const [details, tryAgain] = view.buttons as [HTMLButtonElement, HTMLButtonElement];
    expect(details.getAttribute("aria-label")).toBe("Connection details");
    expect(details.textContent).toContain("Details");
    act(() => details.click());
    expect(view.onDetails).toHaveBeenCalledOnce();
    act(() => tryAgain.click());
    expect(view.onTryAgain).toHaveBeenCalledOnce();
    unmountAll();
    const trying = show({ trying: true });
    expect(trying.buttons[1]?.getAttribute("aria-busy")).toBe("true");
  });
});
