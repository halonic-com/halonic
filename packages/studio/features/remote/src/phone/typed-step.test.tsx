// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FakeNearbyComputers, nearby } from "../test-support/nearby-computers.ts";
import { FakePhoneTunnel } from "../test-support/phone-tunnel.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { PhonePairingFlow, type PhoneScanner } from "./pairing-flow.ts";
import { PairingScreens } from "./pairing-screens.tsx";
import type { ComputerId, ListedComputer } from "./phone-tunnel.ts";
import { TypedStep } from "./typed-step.tsx";
import { LOOKING_MS } from "./use-nearby.ts";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => {
  unmountAll();
  vi.useRealTimers();
});

const noScanner: PhoneScanner = {
  scan: async () => ({ kind: "noScanner" }),
  close: async () => undefined,
};

const office: ListedComputer = {
  id: "computer-1" as ComputerId,
  name: "Office desktop",
  pairedAt: "2026-11-14T14:02:00Z",
  endpoints: ["192.168.1.30:4100"],
  standing: "paired",
};

/** Type a code, on the pairing screens, with the fakes behind it. */
async function setUp(computers: readonly ListedComputer[] = []) {
  const tunnel = new FakePhoneTunnel();
  const found = new FakeNearbyComputers();
  const flow = new PhonePairingFlow(tunnel, noScanner);
  flow.typeInstead();
  const onEnterAddress = vi.fn();
  let screen: HTMLElement | undefined;
  await act(async () => {
    screen = render(
      <PairingScreens
        flow={flow}
        typed={(step) => (
          <TypedStep
            step={step}
            flow={flow}
            nearby={found}
            computers={computers}
            onEnterAddress={onEnterAddress}
          />
        )}
        onOpenSettings={() => undefined}
        onOpenAgents={() => undefined}
        onCamera={() => undefined}
      />,
    );
  });
  if (screen === undefined) throw new Error("Nothing rendered.");
  return { tunnel, found, flow, screen, onEnterAddress };
}

/** Types into the Code field as a person would. */
async function typeCode(screen: HTMLElement, code: string): Promise<void> {
  const field = screen.querySelector<HTMLInputElement>("input[type=text], input:not([type])");
  if (field === null) throw new Error("No Code field.");
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  await act(async () => {
    setValue?.call(field, code);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const radio = (screen: HTMLElement, name: string) =>
  [...screen.querySelectorAll<HTMLInputElement>("input[type=radio]")].find((each) =>
    document
      .getElementById(each.getAttribute("aria-labelledby") ?? "")
      ?.textContent?.startsWith(name),
  );

const pairButton = (screen: HTMLElement) =>
  [...screen.querySelectorAll("button")].find((each) => each.textContent === "Pair");

verifies("remote.phone-typed-picker", () => {
  it("pairs with a computer on this Wi-Fi by its id once a computer and 12 characters are in", async () => {
    const { tunnel, found, screen } = await setUp([office]);
    await act(async () => found.push([nearby("Tim's laptop")]));
    const pair = pairButton(screen);
    expect(pair?.getAttribute("aria-disabled")).toBe("true");
    expect(screen.textContent).toContain("Choose a computer and enter all 12 characters.");
    const laptop = radio(screen, "Tim's laptop");
    expect(
      document.getElementById(laptop?.getAttribute("aria-labelledby") ?? "")?.textContent,
    ).toBe("Tim's laptop, This Wi-Fi");
    expect(radio(screen, "Office desktop")).toBeDefined();
    await act(async () => laptop?.click());
    await typeCode(screen, "7kq2 m4xd 9th");
    expect(pairButton(screen)?.getAttribute("aria-disabled")).toBe("true");
    await typeCode(screen, "7kq2 m4xd 9th6");
    expect(pairButton(screen)?.getAttribute("aria-disabled")).toBeNull();
    await act(async () => pairButton(screen)?.click());
    expect(tunnel.started).toEqual([
      { route: "typed", code: "7KQ2M4XD9TH6", nearby: nearby("Tim's laptop").id },
    ]);
  });

  it("says it is looking while the list is empty, then that none was found yet", async () => {
    const { found, screen } = await setUp();
    expect(screen.querySelector("[role=status]")?.textContent).toBe("Looking for computers…");
    await act(async () => vi.advanceTimersByTime(LOOKING_MS));
    expect(screen.querySelector("[role=status]")).toBeNull();
    expect(screen.textContent).toContain("No computers found yet on this Wi-Fi.");
    await act(async () => found.push([nearby("Tim's laptop")]));
    expect(screen.textContent).not.toContain("No computers found yet");
    expect(radio(screen, "Tim's laptop")).toBeDefined();
  });

  it.each([
    [true, "Open this screen again and choose Allow."],
    [false, "In your phone's Settings, open Apps, Halonic, Permissions, Nearby devices"],
  ])(
    "after Don't allow (asks again: %s), says how to allow Nearby devices under the list",
    async (askAgain, words) => {
      const found = new FakeNearbyComputers();
      found.nextStart = { kind: "no-local-network", askAgain };
      const flow = new PhonePairingFlow(new FakePhoneTunnel(), noScanner);
      let screen: HTMLElement | undefined;
      await act(async () => {
        screen = render(
          <TypedStep
            step={{ step: "typed" }}
            flow={flow}
            nearby={found}
            computers={[office]}
            onEnterAddress={() => undefined}
          />,
        );
      });
      const group = screen?.querySelector("[role=radiogroup]");
      const hint = document.getElementById(group?.getAttribute("aria-describedby") ?? "");
      expect(hint?.textContent).toContain(words);
      expect(screen?.textContent).not.toContain("Looking for computers…");
      expect(screen?.textContent).not.toContain("No computers found yet");
    },
  );

  it("stops looking when the screen goes, and shows the same computer and code after a wrong code", async () => {
    const { tunnel, found, flow, screen } = await setUp();
    tunnel.nextStep = { kind: "wrong-code", triesLeft: 4 };
    await act(async () => found.push([nearby("Tim's laptop")]));
    await act(async () => radio(screen, "Tim's laptop")?.click());
    await typeCode(screen, "7KQ2M4XD9TH6");
    await act(async () => pairButton(screen)?.click());
    expect(found.calls).toContain("stop");
    expect(flow.view).toEqual({ step: "typed", triesLeft: 4 });
    await act(async () => found.push([nearby("Tim's laptop")]));
    expect(found.calls.at(-1)).toBe("browse");
    expect(radio(screen, "Tim's laptop")?.checked).toBe(true);
    expect(screen.querySelector("input:not([type=radio])")).toHaveProperty("value", "7KQ2M4XD9TH6");
    expect(screen.textContent).toContain("That code doesn't match. 4 tries left.");
  });

  it("opens the address screen from Not listed?", async () => {
    const { screen, onEnterAddress } = await setUp();
    const link = [...screen.querySelectorAll("button")].find(
      (each) => each.textContent === "Not listed? Enter its address",
    );
    await act(async () => link?.click());
    expect(onEnterAddress).toHaveBeenCalledOnce();
  });
});
