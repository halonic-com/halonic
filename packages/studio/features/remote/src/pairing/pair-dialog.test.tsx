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

/**
 * The dialog on its own over a fake, at the fake's start time, with `onClose` counted. `prepare`
 * runs on the fake before the dialog opens its pairing.
 */
async function openDialog(prepare?: (remote: FakeRemoteControl) => unknown) {
  const time = new FakeTunnelTime();
  const remote = new FakeRemoteControl({ time });
  await prepare?.(remote);
  const closed = vi.fn();
  render(
    <PairDialog
      remote={remote}
      provider="tailscale"
      allowRisky={false}
      openExternal={() => undefined}
      onClose={closed}
      onCloseFailed={() => undefined}
      now={() => Date.parse("2026-11-16T08:00:00.000Z")}
    />,
  );
  await settle();
  return { remote, time, closed };
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
        onCloseFailed={() => undefined}
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

verifies("remote.pair-a-phone-narrow", () => {
  it("puts the steps below the QR code when the dialog is too narrow for both (C306 PP3)", async () => {
    await openDialog();
    const steps = dialog()?.querySelector("ol");
    const row = steps?.parentElement;

    expect(row?.querySelector('[role="img"]')).not.toBeNull();
    expect(row?.className.split(" ")).toContain("flex-wrap");
    // At least 12rem beside the code, or a line of its own that may shrink to the dialog.
    expect(steps?.className.split(" ")).toEqual(
      expect.arrayContaining(["flex-[1_1_12rem]", "min-w-0"]),
    );
    expect(buttonIn(dialog(), "New code")?.parentElement?.className.split(" ")).toContain(
      "flex-wrap",
    );
  });
});

verifies("remote.pair-a-phone-problems", () => {
  const focused = () => document.activeElement?.textContent;

  it("says the code ran out, and Make a new code shows a new one from the same pairing", async () => {
    let started = 0;
    const { remote, time } = await openDialog((fake) => {
      const start = fake.startPairing.bind(fake);
      vi.spyOn(fake, "startPairing").mockImplementation(() => {
        started++;
        return start();
      });
    });
    const first = typedCode();

    time.advance(5 * 60_000);
    await settle();

    expect(dialog()?.textContent).toContain("The code ran out");
    expect(focused()).toBe("Make a new code");
    expect(remote.snapshot.on).toBe(true);
    await press(buttonIn(dialog(), "Make a new code"));
    expect(typedCode()).toBeDefined();
    expect(typedCode()).not.toBe(first);
    // A new code on the open pairing, so remote stayed on throughout (HAL-14060).
    expect(started).toBe(1);
    expect(remote.snapshot.on).toBe(true);
  });

  it("says why else a pairing ended: too many tries, another pairing, remote off", async () => {
    const tries = await openDialog();
    for (let left = 5; left > 0; left--) tries.remote.wrongTry();
    await settle();
    expect(dialog()?.textContent).toContain("Too many wrong tries");
    unmountAll();

    await openDialog((remote) => remote.startPairing());
    expect(dialog()?.textContent).toContain("Pair a phone is already open");
    expect(focused()).toBe("Try again");
    unmountAll();

    const off = await openDialog();
    await act(() => off.remote.setRemote(false));
    await settle();
    expect(dialog()?.textContent).toContain("Remote was turned off");
  });

  it("shows the tunnel's reason with its actions, and Check again starts a new pairing", async () => {
    await openDialog((remote) => remote.failNextStart("not-installed"));

    expect(dialog()?.textContent).toContain("Tailscale isn't installed");
    expect(dialog()?.textContent).toContain("Nothing is shared until you press Allow.");
    expect(focused()).toContain("Open Tailscale setup");

    await press(buttonIn(dialog(), "Check again"));
    expect(typedCode()).toBeDefined();
  });

  it("gives a new code under Pairing was not allowed after Don't allow", async () => {
    const { remote } = await openDialog();
    remote.phoneUsesCode({ name: "Pixel 8" });
    await settle();

    const scrolled = vi.spyOn(Element.prototype, "scrollIntoView");
    await press(buttonIn(dialog(), "Don't allow"));

    expect(remote.snapshot.phones).toHaveLength(0);
    expect(remote.snapshot.pairing).toBe(true);
    expect(focused()).toContain("Pairing was not allowed");
    // Its title shows first, even where the group is taller than the dialog (C306 PP2).
    const top = scrolled.mock.contexts.at(-1) as Element | undefined;
    expect(top?.textContent).toMatch(/^Pairing was not allowed/);
    expect(scrolled).toHaveBeenLastCalledWith({ block: "start" });
    // With room above it for the top of its focus ring (HAL-14085).
    expect(top?.className.split(" ")).toContain("scroll-mt-2");
    expect(typedCode()).toBeDefined();
  });

  it("says when the host can't make a code, or Allow fails", async () => {
    await openDialog((remote) => {
      vi.spyOn(remote, "startPairing").mockRejectedValueOnce(new Error("host down"));
    });
    expect(dialog()?.textContent).toContain("Couldn't make a code");
    await press(buttonIn(dialog(), "Try again"));
    expect(typedCode()).toBeDefined();
    unmountAll();

    const { remote } = await openDialog((fake) => {
      const start = fake.startPairing.bind(fake);
      vi.spyOn(fake, "startPairing").mockImplementation(async () => {
        const session = await start();
        vi.spyOn(session, "allow").mockRejectedValue(new Error("store full"));
        return session;
      });
    });
    remote.phoneUsesCode({ name: "Pixel 8" });
    await settle();
    await press(buttonIn(dialog(), "AllowAllowing…"));
    // The dialog's alert slot fills a frame after the request ends.
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));

    expect(dialog()?.textContent).toContain("Couldn't pair Pixel 8. Try again.");
    expect(dialog()?.textContent).toContain("Check the code");
  });

  it("drops a failed Allow's line once Check the code goes, so the next phone's starts clear", async () => {
    const { remote, time } = await openDialog((fake) => {
      const start = fake.startPairing.bind(fake);
      vi.spyOn(fake, "startPairing").mockImplementation(async () => {
        const session = await start();
        vi.spyOn(session, "allow").mockRejectedValueOnce(new Error("store full"));
        return session;
      });
    });
    remote.phoneUsesCode({ name: "Pixel 8" });
    await settle();
    await press(buttonIn(dialog(), "AllowAllowing…"));
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    expect(dialog()?.textContent).toContain("Couldn't pair Pixel 8. Try again.");

    // The wait for Allow runs out, and another phone uses the new code.
    time.advance(2 * 60_000);
    await settle();
    expect(dialog()?.textContent).toContain("The code ran out");
    await press(buttonIn(dialog(), "Make a new code"));
    remote.phoneUsesCode({ name: "Galaxy S24" });
    await settle();
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));

    expect(dialog()?.textContent).toContain("Galaxy S24");
    expect(dialog()?.textContent).not.toContain("Couldn't pair");
    expect(dialog()?.querySelector('[role="alert"]')?.textContent ?? "").toBe("");
  });

  it("closes even when the host fails to end the pairing, and Settings › Remote says so", async () => {
    const remote = new FakeRemoteControl();
    const start = remote.startPairing.bind(remote);
    vi.spyOn(remote, "startPairing").mockImplementation(async () => {
      const session = await start();
      vi.spyOn(session, "close").mockRejectedValue(new Error("the host didn't answer"));
      return session;
    });
    const announced: string[] = [];
    const view = render(
      <RemoteSection
        context={remoteContext(remote, announced)}
        closeSettings={() => undefined}
        place="app"
        surface="window"
      />,
    );
    await settle();
    await press(buttonIn(view, "Pair a phone"));

    await press(buttonIn(dialog(), "Close Pair a phone"));

    expect(dialog()).toBeNull();
    expect(view.textContent).toContain("Couldn't turn remote off. Try again.");
    expect(announced).toEqual(["Couldn't turn remote off. Try again."]);
  });
});
