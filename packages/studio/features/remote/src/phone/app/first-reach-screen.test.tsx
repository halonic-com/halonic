// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FakePhoneTunnel } from "../../test-support/phone-tunnel.ts";
import type { ComputerId } from "../phone-tunnel.ts";
import { mountPhoneApp } from "./mount-phone-app.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const laptop = "c-1" as ComputerId;
const unmounts: (() => void)[] = [];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 22, 10, 42));
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  for (const unmount of unmounts.splice(0)) act(unmount);
  document.body.replaceChildren();
  vi.useRealTimers();
});

async function wait(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Opens Tim's laptop, paired through Tailscale, which hasn't answered yet. */
async function openLaptop(): Promise<FakePhoneTunnel> {
  const tunnel = new FakePhoneTunnel();
  tunnel.computers.set(laptop, {
    id: laptop,
    name: "Tim's laptop",
    pairedAt: "2026-11-14T10:00:00Z",
    endpoints: ["wss://studio.tail1234.ts.net"],
    standing: "paired",
  });
  const container = document.createElement("section");
  document.body.append(container);
  await act(async () => {
    unmounts.push(
      mountPhoneApp(container, {
        tunnel,
        scanner: { scan: () => new Promise(() => undefined), close: () => Promise.resolve() },
        window,
        onAddress: () => undefined,
        report: () => undefined,
        onCamera: () => undefined,
        onOpenSettings: () => undefined,
        onOpenTailscale: () => undefined,
        onOpenLink: () => undefined,
      }),
    );
  });
  await wait(0);
  await act(async () => tunnel.push(laptop, { state: "connecting" }));
  return tunnel;
}

function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll("button")].find(
    (each) => each.textContent?.trim() === name || each.getAttribute("aria-label") === name,
  );
  if (found === undefined) throw new Error(`No ${name} button.`);
  return found;
}

async function press(name: string): Promise<void> {
  await act(async () => button(name).click());
}

const text = () => document.body.textContent ?? "";

verifies("remote.phone-first-reach", () => {
  it("says what it waits for, why from 10 seconds, and then offers Something wrong?", async () => {
    await openLaptop();
    await wait(9_000);
    expect(text()).toContain("Reaching Tim's laptop…");
    expect(button("Something wrong?").className).toContain("invisible");
    await wait(3_000);
    expect(text()).toContain("12 s");
    expect(text()).toContain("Halonic has to be open there. This can take a moment.");
    expect(button("Something wrong?").className).not.toContain("invisible");
  });

  it("gives up at 30 seconds with the two causes, and Try again starts over", async () => {
    const tunnel = await openLaptop();
    await wait(30_000);
    expect(document.querySelector("header")?.textContent).toContain("Tim's laptop isn't answering");
    expect(text()).toContain(
      "Halonic may be closed there, or Tailscale may be off on that computer.",
    );
    tunnel.calls.length = 0;
    await press("Try again");
    expect(tunnel.calls).toEqual([`connect ${laptop}`]);
    await wait(2_000);
    expect(text()).toContain("Reaching Tim's laptop…");
  });

  it("stands the seconds still while the tunnel is closed, and counts on from them", async () => {
    const tunnel = await openLaptop();
    await wait(12_000);
    await act(async () => tunnel.push(laptop, { state: "closed" }));
    await wait(60_000);
    expect(text()).toContain("12 s");
    await act(async () => tunnel.push(laptop, { state: "connecting" }));
    await wait(3_000);
    expect(text()).toContain("15 s");
  });

  it("comes back at the held seconds when the waiting line returns after the phone was offline", async () => {
    const tunnel = await openLaptop();
    await wait(12_000);
    await act(async () => tunnel.push(laptop, { state: "reconnecting", lastTry: "network-down" }));
    expect(text()).not.toContain("Reaching Tim's laptop…");
    await wait(60_000);
    await act(async () => tunnel.push(laptop, { state: "reconnecting" }));
    expect(text()).toContain("Reaching Tim's laptop…");
    expect(text()).toContain("12 s");
    await wait(3_000);
    expect(text()).toContain("15 s");
  });
});

verifies("remote.phone-connection-check", () => {
  it("opens from Something wrong?, checking until a try finishes", async () => {
    await openLaptop();
    await wait(10_000);
    await press("Something wrong?");
    expect(document.querySelector("dialog[open] h2")?.textContent).toBe("Check this connection");
    expect(text()).toContain("Checking the connection");
    expect(text()).toContain("Not checked here: Halonic's engine, models and sandbox.");
    expect(text()).not.toContain("Copy report");
  });

  it("shows the problem and copies the report after the give-up", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await openLaptop();
    await wait(30_000);
    await press("Check this connection");
    expect(text()).toContain("1 problem");
    expect(text()).toContain("Tim's laptop isn't answering.");
    await press("Copy report");
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("✕ Your computer   isn't answering · no answer in 30 seconds"),
    );
    expect(text()).toContain("Copied the report.");
  });
});
