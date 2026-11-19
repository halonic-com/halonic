// @vitest-environment jsdom

import { FakeRemoteControl, FakeTunnelTime } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RemoteSection } from "../settings/remote-section.tsx";
import { remoteContext, settle } from "../test-support/context.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { PairDialog } from "./pair-dialog.tsx";

beforeEach(() => {
  Element.prototype.scrollIntoView ??= () => undefined;
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

const dialog = () => document.querySelector("dialog");
const buttonIn = (within: ParentNode | null, label: string) =>
  [...(within?.querySelectorAll("button") ?? [])].find(
    (found) => found.textContent?.trim() === label || found.getAttribute("aria-label") === label,
  );

/** The typed code's spoken name, "Pairing code: 7, K, Q, 2, …", which differs per code. */
const typedCode = () =>
  [...(dialog()?.querySelectorAll('[role="img"]') ?? [])]
    .map((image) => image.getAttribute("aria-label"))
    .find((label) => label?.startsWith("Pairing code: "));

async function press(element: Element | undefined) {
  if (!(element instanceof HTMLElement)) throw new Error("Nothing to press");
  act(() => element.click());
  await settle();
}

/** The dialog on its own over a fake, at the fake's start time, with `onClose` counted. */
async function openDialog() {
  const remote = new FakeRemoteControl({ time: new FakeTunnelTime() });
  const closed = vi.fn();
  render(
    <PairDialog
      remote={remote}
      provider="tailscale"
      allowRisky={false}
      openExternal={() => undefined}
      onClose={closed}
      now={() => Date.parse("2026-11-16T08:00:00.000Z")}
    />,
  );
  await settle();
  return { remote, closed };
}

verifies("remote.pair-a-phone", () => {
  it("opens from Settings › Remote and turns remote on", async () => {
    const remote = new FakeRemoteControl();
    const view = render(
      <RemoteSection
        context={remoteContext(remote)}
        closeSettings={() => undefined}
        place="app"
        surface="window"
      />,
    );
    await settle();
    expect(remote.snapshot.on).toBe(false);

    await press(buttonIn(view, "Pair a phone"));

    expect(remote.snapshot.on).toBe(true);
    expect(remote.snapshot.pairing).toBe(true);
    expect(dialog()?.textContent).toContain("Scan this code.");
  });

  it("shows the code to scan, the steps, the time left and where it is reached", async () => {
    await openDialog();
    const text = dialog()?.textContent ?? "";

    expect(dialog()?.querySelector('[role="img"]')?.getAttribute("aria-label")).toContain(
      "QR code to pair your phone",
    );
    expect(text).toContain("On your phone, open Halonic and tap Pair with a computer.");
    expect(text).toContain("Check the code on both screens, then press Allow here.");
    expect(text).toContain("The code works once and ends in 5:00.");
    expect(text).toContain("Shell, files and secrets stay here");
    expect(text).toContain("Reached through Tailscale");
  });

  it("counts the time down as text, once a second", async () => {
    vi.useFakeTimers();
    let now = Date.parse("2026-11-16T08:00:00.000Z");
    render(
      <PairDialog
        remote={new FakeRemoteControl()}
        provider="tailscale"
        allowRisky={false}
        openExternal={() => undefined}
        onClose={() => undefined}
        now={() => now}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    now += 28_000;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(dialog()?.textContent).toContain("ends in 4:32.");
  });

  it("shows the code to type, with the computer's name, behind Can't scan", async () => {
    await openDialog();
    const toggle = buttonIn(dialog(), "Can't scan? Type a code");
    const typed = document.getElementById(toggle?.getAttribute("aria-controls") ?? "");
    expect(typed?.hidden).toBe(true);

    await press(toggle);

    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(typed?.hidden).toBe(false);
    expect(typed?.textContent).toContain("choose Test laptop and enter");
    expect(typed?.querySelector('[role="img"]')?.getAttribute("aria-label")).toMatch(
      /^Pairing code: (\w, ){11}\w$/u,
    );
  });

  it("makes a new code on New code", async () => {
    const { remote } = await openDialog();
    const first = typedCode();
    expect(first).toBeDefined();

    await press(buttonIn(dialog(), "New code"));

    expect(remote.snapshot.pairing).toBe(true);
    expect(typedCode()).toBeDefined();
    expect(typedCode()).not.toBe(first);
  });

  it("asks Is this your phone with focus on the check code, and pairs only on Allow", async () => {
    const { remote } = await openDialog();
    const checkCode = remote.phoneUsesCode({ name: "Pixel 8" });
    await settle();

    expect(dialog()?.textContent).toContain("Is this your phone? It shows the same code now.");
    expect(dialog()?.textContent).toContain("Android · reached through Tailscale");
    const code = document.activeElement?.querySelector('[role="img"]');
    expect(code?.getAttribute("aria-label")).toBe(`Check code: ${[...checkCode].join(", ")}`);
    expect(remote.snapshot.phones).toHaveLength(0);

    // The confirming button holds its busy label too, to keep its width: "AllowAllowing…".
    await press(buttonIn(dialog(), "AllowAllowing…"));

    expect(remote.snapshot.phones.map((phone) => phone.name)).toEqual(["Pixel 8"]);
    expect(dialog()?.textContent).toContain("Pixel 8 is paired");
    expect(dialog()?.textContent).toContain("Risky approvals wait for you here.");
    expect(document.activeElement?.textContent).toBe("Done");
  });

  it("closes on Done, and closing before a phone is paired turns remote off again", async () => {
    const { remote, closed } = await openDialog();
    expect(remote.snapshot.on).toBe(true);

    await press(buttonIn(dialog(), "Close Pair a phone"));

    expect(closed).toHaveBeenCalledOnce();
    expect(remote.snapshot.pairing).toBe(false);
    expect(remote.snapshot.on).toBe(false);
  });
});
