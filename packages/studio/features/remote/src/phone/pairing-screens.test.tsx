// @vitest-environment jsdom

import type { PairingQrPayload } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { FakePhoneTunnel } from "../test-support/phone-tunnel.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { PhonePairingFlow, type PhoneScanner } from "./pairing-flow.ts";
import { PairingScreens } from "./pairing-screens.tsx";

afterEach(unmountAll);

const payload: PairingQrPayload = {
  hostKey: new Uint8Array(32).fill(7),
  code: "7KQ2M4XD9TH6",
  hostName: "Tim's laptop",
  endpoints: ["wss://studio.tail1234.ts.net"],
};

type ScanAnswer = Awaited<ReturnType<PhoneScanner["scan"]>>;

/** A scanner whose next read the test hands over; closing it answers `closed`. */
class HeldScanner implements PhoneScanner {
  closes = 0;
  private release: ((answer: ScanAnswer) => void) | undefined;
  scan(): Promise<ScanAnswer> {
    return new Promise((resolve) => {
      this.release = resolve;
    });
  }
  async read(answer: ScanAnswer): Promise<void> {
    await act(async () => this.release?.(answer));
  }
  async close(): Promise<void> {
    this.closes += 1;
    this.release?.({ kind: "closed" });
  }
}

function setUp() {
  const tunnel = new FakePhoneTunnel();
  const scanner = new HeldScanner();
  const flow = new PhonePairingFlow(tunnel, scanner, { setTimer: () => () => undefined });
  const onOpenAgents = vi.fn();
  const onOpenSettings = vi.fn();
  const camera: boolean[] = [];
  const onCamera = (showing: boolean) => camera.push(showing);
  const screen = render(
    <PairingScreens
      flow={flow}
      typed={(step) => <p>typed {step.triesLeft ?? "first"}</p>}
      onOpenSettings={onOpenSettings}
      onOpenAgents={onOpenAgents}
      onCamera={onCamera}
    />,
  );
  return { tunnel, scanner, screen, camera, onOpenAgents, onOpenSettings };
}

const button = (screen: HTMLElement, name: string) =>
  [...screen.querySelectorAll("button")].find(
    (each) => each.textContent === name || each.getAttribute("aria-label") === name,
  );

const press = async (screen: HTMLElement, name: string) => {
  const found = button(screen, name);
  expect(found, name).toBeDefined();
  await act(async () => found?.click());
};

verifies("remote.phone-pairing", () => {
  it("walks a scanned code through Check the code to Paired", async () => {
    const { tunnel, scanner, screen, camera, onOpenAgents } = setUp();
    const allow = Promise.withResolvers<void>();
    const answer = tunnel.waitForAllow.bind(tunnel);
    tunnel.waitForAllow = async (pairing) => {
      await allow.promise;
      return answer(pairing);
    };
    expect(screen.textContent).toContain("Settings › Remote");
    await press(screen, "Scan code");
    expect(screen.querySelector("[role=status]")?.textContent).toBe(
      "Point the camera at the code on your computer",
    );
    expect(camera).toEqual([true]);
    await scanner.read({ kind: "pairingCode", payload });
    expect(camera).toEqual([true, false]);
    expect(screen.textContent).toContain("Is this the same code as on Tim's laptop?");
    expect(screen.querySelector("[role=img]")?.getAttribute("aria-label")).toBe(
      "Check the code: 4, F, 7, 2, K, Q",
    );
    // Focus starts on the code, so a screen reader reads it first.
    expect(document.activeElement?.contains(screen.querySelector("[role=img]"))).toBe(true);
    await act(async () => allow.resolve());
    expect(screen.querySelector("h2")?.textContent).toBe("Paired with Tim's laptop");
    expect(document.activeElement?.textContent).toBe("Open agents");
    await press(screen, "Open agents");
    expect(onOpenAgents).toHaveBeenCalledWith(expect.objectContaining({ name: "Tim's laptop" }));
  });

  it("says a code isn't ours in place of the hint", async () => {
    const { scanner, screen } = setUp();
    await press(screen, "Scan code");
    await scanner.read({ kind: "notAPairingCode" });
    expect(screen.querySelector("[role=status]")?.textContent).toBe(
      "This isn't a Halonic pairing code.",
    );
  });

  it("closes the camera with the X, and when the screen goes away", async () => {
    const { scanner, screen } = setUp();
    await press(screen, "Scan code");
    await press(screen, "Close scanner");
    expect(scanner.closes).toBe(1);
    expect(button(screen, "Scan code")).toBeDefined();
    await press(screen, "Scan code");
    act(() => unmountAll());
    expect(scanner.closes).toBe(2);
  });

  it("offers settings and the typed route without the camera, and only typing without a scanner", async () => {
    const { scanner, screen, onOpenSettings } = setUp();
    await press(screen, "Scan code");
    await scanner.read({ kind: "noCamera", askAgain: false });
    expect(screen.textContent).toContain("Halonic can't use the camera");
    await press(screen, "Open settings");
    expect(onOpenSettings).toHaveBeenCalled();
    await press(screen, "Type a code instead");
    expect(screen.textContent).toBe("typed first");

    const other = setUp();
    await press(other.screen, "Scan code");
    await other.scanner.read({ kind: "noScanner" });
    expect(button(other.screen, "Scan code")).toBeUndefined();
    expect(button(other.screen, "Type a code instead")).toBeDefined();
  });

  it("ends the pairing on both sides with Cancel on Check the code", async () => {
    const { tunnel, scanner, screen } = setUp();
    tunnel.waitForAllow = () => new Promise(() => undefined);
    await press(screen, "Scan code");
    await scanner.read({ kind: "pairingCode", payload });
    await press(screen, "Cancel");
    expect(tunnel.calls).toContain("cancel pairing-1");
    expect(button(screen, "Scan code")).toBeDefined();
  });
});

verifies("remote.phone-pairing-problems", () => {
  it("draws a problem screen whose Try again sends the same code", async () => {
    const { tunnel, scanner, screen } = setUp();
    tunnel.nextStep = { kind: "rate-limited" };
    await press(screen, "Scan code");
    await scanner.read({ kind: "pairingCode", payload });
    expect(screen.querySelector("h2")?.textContent).toBe("Too many tries on Tim's laptop");
    tunnel.nextStep = {
      kind: "check",
      pairing: "pairing-2" as never,
      checkCode: "4F72KQ",
      computerName: "Tim's laptop",
    };
    await press(screen, "Try again");
    expect(tunnel.started).toHaveLength(2);
    expect(tunnel.started[1]).toEqual(tunnel.started[0]);
  });
});
