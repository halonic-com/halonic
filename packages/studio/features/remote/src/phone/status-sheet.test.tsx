// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { StatusSheet, type StatusSheetOf, type StatusSheetProps } from "./status-sheet.tsx";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

afterEach(unmountAll);

const now = new Date(2026, 10, 22, 14, 5, 0);
const lastUpdate = new Date(2026, 10, 22, 14, 2, 0);

function show(sheet: StatusSheetOf, more: Partial<StatusSheetProps> = {}) {
  const actions = {
    onTryAgain: vi.fn(),
    onOpenSettings: vi.fn(),
    onOpenTailscale: vi.fn(),
    onOpenComputers: vi.fn(),
    onClose: vi.fn(),
  };
  render(
    <StatusSheet
      sheet={sheet}
      computer="Tim's laptop"
      asOf={lastUpdate}
      agents={{ running: 1, waiting: 1 }}
      now={now}
      {...actions}
      {...more}
    />,
  );
  const dialog = document.querySelector("dialog");
  if (dialog === null) throw new Error("no sheet");
  const button = (name: string) => {
    const found = [...dialog.querySelectorAll("button")].find((b) => b.textContent === name);
    if (found === undefined) throw new Error(`no button ${name}`);
    return found;
  };
  const cards = [...dialog.querySelectorAll("section")].map((section) => ({
    name: section.getAttribute("aria-label"),
    text: section.querySelector("p:last-child")?.textContent,
  }));
  return { dialog, button, cards, actions };
}

verifies("remote.phone-status-sheet", () => {
  it("shows the two halves when the computer doesn't answer, and Try again connects", () => {
    const { dialog, button, cards, actions } = show({ kind: "unreachable", route: "tailscale" });
    expect(dialog.querySelector("h2")?.textContent).toBe("Your computer isn't answering");
    expect(cards).toEqual([
      {
        name: "Your phone",
        text: "It is online, but Tim's laptop doesn't answer, so it can't show new work or take your answers.",
      },
      {
        name: "Your agents · as of 14:02",
        text: "1 running, 1 waiting for you. If your computer is on, they keep running. Anything that needs you waits.",
      },
    ]);
    expect(dialog.textContent).toContain(
      "Check that Tim's laptop is on and awake, Halonic is open, and Tailscale is on there.",
    );
    act(() => button("Try again").click());
    expect(actions.onTryAgain).toHaveBeenCalledOnce();
    unmountAll();

    // Through this Wi-Fi there's no Tailscale to check (C660-35).
    const wifi = show({ kind: "unreachable", route: "wifi" });
    expect(wifi.dialog.textContent).toContain(
      "Check that Tim's laptop is on and awake, Halonic is open, and both are on the same Wi-Fi.",
    );
    expect(wifi.dialog.textContent).not.toContain("Tailscale");
  });

  it("asks about the phone, never the computer, when the phone is offline", () => {
    const { dialog, cards } = show({ kind: "phoneOffline" });
    expect(dialog.querySelector("h2")?.textContent).toBe("Your phone is offline");
    expect(cards[0]?.text).toBe(
      "It has no internet, so it can't reach Tim's laptop, show new work or take your answers.",
    );
    expect(dialog.textContent).toContain(
      "Turn on Wi-Fi or mobile data. It reconnects by itself when it is back online.",
    );
    expect(dialog.textContent).not.toContain("Check that");
  });

  it("offers Open Tailscale and Open settings for the phone's own causes", () => {
    const tailscale = show({ kind: "tailscaleOff" });
    expect(tailscale.dialog.querySelector("h2")?.textContent).toBe(
      "Tailscale is off on this phone",
    );
    act(() => tailscale.button("Open Tailscale").click());
    expect(tailscale.actions.onOpenTailscale).toHaveBeenCalledOnce();
    unmountAll();

    const nearby = show({ kind: "nearbyOff" });
    expect(nearby.cards[0]?.text).toBe(
      "Without the Nearby devices permission, it can't reach Tim's laptop on this Wi-Fi, show new work or take your answers.",
    );
    act(() => nearby.button("Open settings").click());
    expect(nearby.actions.onOpenSettings).toHaveBeenCalledOnce();
    expect(() => nearby.button("Try again")).toThrow();
  });

  it("counts down to the next try in whole seconds, then says it is trying now", () => {
    const soon = show({ kind: "reconnecting", nextTryAt: new Date(now.getTime() + 7200) });
    expect(soon.dialog.querySelector("h2")?.textContent).toBe("Reconnecting…");
    expect(soon.dialog.textContent).toContain(
      "Looking for Tim's laptop. Trying again in 8 seconds.",
    );
    expect(soon.dialog.textContent).toContain(
      "Last update 14:02. What you see may be out of date until it reconnects.",
    );
    act(() => soon.button("Try now").click());
    expect(soon.actions.onTryAgain).toHaveBeenCalledOnce();
    unmountAll();

    const passed = show({ kind: "reconnecting", nextTryAt: new Date(now.getTime() - 1) });
    expect(passed.dialog.textContent).toContain("Looking for Tim's laptop. Trying now…");
  });

  it("names the route and the last update when connected, with Paired computers", () => {
    const { dialog, button, cards, actions } = show(
      { kind: "connected", route: "tailscale" },
      { asOf: now },
    );
    expect(dialog.querySelector("h2")?.textContent).toBe("Connected");
    expect(dialog.textContent).toContain("Tim's laptop, through Tailscale. Last update 14:05.");
    expect(cards).toEqual([]);
    act(() => button("Paired computers").click());
    expect(actions.onOpenComputers).toHaveBeenCalledOnce();
    unmountAll();

    const wifi = show({ kind: "connected", route: "wifi" }, { asOf: now });
    expect(wifi.dialog.textContent).toContain("Tim's laptop, through this Wi-Fi.");
  });

  it("says no last update and shows no agents card before anything has arrived", () => {
    const trouble = show({ kind: "unreachable", route: "tailscale" }, { asOf: undefined });
    expect(trouble.cards.map((c) => c.name)).toEqual(["Your phone"]);
    unmountAll();

    const connected = show({ kind: "connected", route: "tailscale" }, { asOf: undefined });
    expect(connected.dialog.textContent).toContain("Tim's laptop, through Tailscale.");
    expect(connected.dialog.textContent).not.toContain("Last update");
  });
});
