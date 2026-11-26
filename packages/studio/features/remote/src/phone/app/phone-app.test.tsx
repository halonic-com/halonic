// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FakePhoneTunnel } from "../../test-support/phone-tunnel.ts";
import type { PhoneScanner } from "../pairing-flow.ts";
import type { ComputerId } from "../phone-tunnel.ts";
import { mountPhoneApp } from "./mount-phone-app.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  Element.prototype.scrollIntoView ??= () => undefined;
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

const unmounts: (() => void)[] = [];
afterEach(() => {
  for (const unmount of unmounts.splice(0)) act(unmount);
  document.body.replaceChildren();
});

const scanner: PhoneScanner = {
  scan: () => new Promise(() => undefined),
  close: () => Promise.resolve(),
};

const laptop = "c-1" as ComputerId;

async function mount(tunnel: FakePhoneTunnel) {
  const container = document.createElement("section");
  document.body.append(container);
  const onAddress = vi.fn();
  await act(async () => {
    unmounts.push(
      mountPhoneApp(container, {
        tunnel,
        scanner,
        window,
        onAddress,
        report: () => undefined,
        onCamera: () => undefined,
        onOpenSettings: () => undefined,
        onOpenTailscale: () => undefined,
        onOpenLink: () => undefined,
      }),
    );
  });
  await settle();
  return { container, onAddress };
}

function withLaptop(): FakePhoneTunnel {
  const tunnel = new FakePhoneTunnel();
  tunnel.computers.set(laptop, {
    id: laptop,
    name: "Tim's laptop",
    pairedAt: "2026-11-14T10:00:00Z",
    endpoints: ["wss://studio.tail1234.ts.net"],
    standing: "paired",
  });
  return tunnel;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const heading = () => document.querySelector("h1, h2")?.textContent;

async function press(name: string): Promise<void> {
  const found = [...document.querySelectorAll("button")].find(
    (each) => each.textContent?.trim() === name || each.getAttribute("aria-label") === name,
  );
  expect(found, name).toBeDefined();
  await act(async () => found?.click());
  await settle();
}

verifies("remote.phone-app", () => {
  it("shows Pair with a computer when nothing is paired, and its typed route offers the address", async () => {
    const { onAddress, container } = await mount(new FakePhoneTunnel());
    expect(heading()).toBe("Pair with a computer");
    await press("Type a code instead");
    await press("Not listed? Enter its address");
    expect(onAddress).toHaveBeenCalledWith(true);
    expect(container.hidden).toBe(true);
  });

  it("shows the scanner full-bleed, without the top bar, and keeps it open (C49 G7)", async () => {
    await mount(new FakePhoneTunnel());
    await press("Scan code");
    expect(document.querySelector("header")).toBeNull();
    const title = document.querySelector("h1");
    expect(title?.textContent).toBe("Pair with a computer");
    expect(title?.className).toBe("sr-only");
    expect(document.body.textContent).toContain("Point the camera at the code on your computer");
    await press("Close scanner");
    expect(heading()).toBe("Pair with a computer");
  });

  it("opens the status sheet from the label, then Paired computers, and Back comes back", async () => {
    const tunnel = withLaptop();
    await mount(tunnel);
    await act(async () => tunnel.push(laptop, { state: "connected" }));
    await press("Connected to Tim's laptop. Details");
    expect(document.querySelector("dialog[open]")).not.toBeNull();
    await press("Paired computers");
    expect(heading()).toBe("Paired computers");
    expect(document.body.textContent).toContain("Tim's laptop");
    await press("Back");
    expect(document.querySelector("header")?.textContent).toContain("Connected · Tim's laptop");
  });

  it("keeps one history entry while a sheet or Paired computers is open (C48 HB1, PC1)", async () => {
    const tunnel = withLaptop();
    await mount(tunnel);
    await act(async () => tunnel.push(laptop, { state: "connected" }));
    // Counts the calls, not history.length: jsdom shares one history between the tests.
    const back = vi.spyOn(window.history, "back");
    const push = vi.spyOn(window.history, "pushState");
    await press("Connected to Tim's laptop. Details");
    await press("Paired computers");
    expect(push).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.querySelector("h1"));
    back.mockRestore();
    push.mockRestore();
  });

  it("says a computer forgotten on Removed after its screen has gone (C48 ST1)", async () => {
    const tunnel = withLaptop();
    await mount(tunnel);
    await act(async () => tunnel.push(laptop, { state: "removed" }));
    await press("Forget this computer");
    const confirm = [...document.querySelectorAll("dialog button")].find((each) =>
      each.textContent?.startsWith("Forget"),
    );
    await act(async () => (confirm as HTMLButtonElement | undefined)?.click());
    await settle();
    expect(heading()).toBe("Pair with a computer");
    expect(document.querySelector("[aria-live=polite]")?.textContent).toBe(
      "Tim's laptop forgotten.",
    );
  });

  it("shows the stale banner while a computer it reached isn't answering", async () => {
    const tunnel = withLaptop();
    await mount(tunnel);
    await act(async () => tunnel.push(laptop, { state: "connected" }));
    await act(async () => tunnel.push(laptop, { state: "reconnecting", lastTry: "timeout" }));
    expect(document.body.textContent).toContain(
      "If your computer is on, your agents there keep running.",
    );
  });

  it("shows Removed in place of the computer's screen", async () => {
    const tunnel = withLaptop();
    await mount(tunnel);
    await act(async () => tunnel.push(laptop, { state: "removed" }));
    expect(document.querySelector("h2")?.textContent).toBe("Removed from Tim's laptop");
    expect(document.querySelector("h1")?.textContent).toBe("Tim's laptop");
  });
});
