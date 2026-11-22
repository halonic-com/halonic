// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import { computerMeta, routeOf } from "./computers-words.ts";
import { computerRowState, PairedComputers } from "./paired-computers.tsx";
import type { ComputerId, PairedComputer, PhoneStatus } from "./phone-tunnel.ts";

beforeEach(() => {
  Element.prototype.scrollIntoView ??= () => undefined;
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});

afterEach(unmountAll);

const now = new Date(2026, 10, 22, 9, 0);

const computer = (
  name: string,
  id: string,
  more: Partial<Omit<PairedComputer, "id" | "name">> = {},
): PairedComputer => ({
  id: id as ComputerId,
  name,
  pairedAt: new Date(2026, 10, 14, 10, 0).toISOString(),
  endpoints: ["wss://studio.tail1234.ts.net"],
  standing: "paired",
  ...more,
});

const laptop = computer("Tim's laptop", "c-1");
const studio = computer("Studio PC", "c-2", {
  pairedAt: new Date(2026, 10, 3, 10, 0).toISOString(),
  endpoints: ["tcp://100.101.2.3:4100"],
});

function show(
  computers: readonly PairedComputer[],
  statuses: ReadonlyMap<ComputerId, PhoneStatus> = new Map(),
  onForget: (computer: PairedComputer) => Promise<void> = async () => undefined,
) {
  const onPair = vi.fn();
  const screen = render(
    <PairedComputers
      computers={computers}
      statuses={statuses}
      onForget={onForget}
      onPair={onPair}
      now={() => now}
    />,
  );
  return { screen, onPair };
}

const buttons = () => [...document.querySelectorAll("button")];
const named = (name: string) =>
  buttons().find(
    (each) => each.getAttribute("aria-label") === name || each.textContent?.trim() === name,
  );
const press = async (name: string) => {
  const found = named(name);
  expect(found, name).toBeDefined();
  await act(async () => found?.click());
};

describe("routeOf", () => {
  it("reads Tailscale from a .ts.net name or a 100.64/10 address, else this Wi-Fi", () => {
    expect(routeOf("wss://studio.tail1234.ts.net")).toBe("Tailscale");
    expect(routeOf("tcp://100.101.2.3:4100")).toBe("Tailscale");
    expect(routeOf("100.64.0.1:4100")).toBe("Tailscale");
    expect(routeOf("tcp://100.128.0.1:4100")).toBe("This Wi-Fi");
    expect(routeOf("tcp://192.168.1.20:4100")).toBe("This Wi-Fi");
    expect(routeOf("studio.local:4100")).toBe("This Wi-Fi");
  });
});

verifies("remote.phone-paired-computers", () => {
  it("lists each computer with its route, the day it paired and its state", () => {
    const { screen } = show(
      [laptop, studio],
      new Map<ComputerId, PhoneStatus>([
        [laptop.id, { state: "connected" }],
        [studio.id, { state: "reconnecting", lastTry: "timeout" }],
      ]),
    );
    const rows = [...screen.querySelectorAll("li")];
    expect(rows.map((row) => row.querySelector(".sr-only")?.textContent)).toEqual([
      "Tim's laptop, Tailscale, paired 14 Nov. Connected",
      "Studio PC, Tailscale, paired 3 Nov. Can't reach",
    ]);
    expect(rows[0]?.textContent).toContain("Tailscale · Paired 14 Nov");
    // Only Can't reach dims.
    expect(rows[0]?.className).not.toContain("opacity");
    expect(rows[1]?.className).toContain("opacity-60");
    expect(screen.textContent).toContain(
      "Forget only removes a computer from this phone. To cut this phone off for good, revoke it in Halonic on the computer.",
    );
    expect(named("Forget Tim's laptop")).toBeDefined();
    expect(named("Forget Studio PC")).toBeDefined();
  });

  it("keeps Removed and Can't confirm at full strength, whatever the connection says", () => {
    expect(computerRowState({ ...laptop, standing: "removed" }, { state: "connected" })).toBe(
      "removed",
    );
    expect(computerRowState({ ...laptop, standing: "cant-confirm" }, undefined)).toBe(
      "cantConfirm",
    );
    expect(computerRowState(laptop, { state: "reconnecting", lastTry: "network-down" })).toBe(
      "phoneOffline",
    );
    expect(computerRowState(laptop, { state: "closed" })).toBeUndefined();
    const { screen } = show([{ ...laptop, standing: "removed" }]);
    const row = screen.querySelector("li");
    expect(row?.className).not.toContain("opacity");
    expect(row?.textContent).toContain("Removed");
  });

  it("asks once before Forget, says the computer still lists the phone, then forgets", async () => {
    const onForget = vi.fn(async () => undefined);
    show([laptop, studio], new Map(), onForget);
    await press("Forget Tim's laptop");
    const sheet = document.querySelector("dialog");
    expect(sheet?.textContent).toContain("Forget Tim's laptop?");
    expect(sheet?.textContent).toContain(
      "This phone stops trying to reach it and clears what it saved from it.",
    );
    expect(sheet?.textContent).toContain(
      "The computer still lists this phone as paired. To cut it off there, use Revoke in Settings › Remote.",
    );
    expect(onForget).not.toHaveBeenCalled();
    const confirm = [...(sheet?.querySelectorAll("button") ?? [])].find((each) =>
      each.textContent?.startsWith("Forget"),
    );
    await act(async () => confirm?.click());
    expect(onForget).toHaveBeenCalledWith(laptop);
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("changes nothing on Cancel, and keeps the sheet open with the reason when Forget fails", async () => {
    const onForget = vi.fn(async () => {
      throw new Error("keystore");
    });
    show([laptop], new Map(), onForget);
    await press("Forget Tim's laptop");
    await press("Cancel");
    expect(document.querySelector("dialog")).toBeNull();
    expect(onForget).not.toHaveBeenCalled();
    await press("Forget Tim's laptop");
    const confirm = [...(document.querySelector("dialog")?.querySelectorAll("button") ?? [])].find(
      (each) => each.textContent?.startsWith("Forget"),
    );
    await act(async () => confirm?.click());
    // The dialog's alert slot fills a frame after the request ends.
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    expect(document.querySelector("dialog")?.textContent).toContain(
      "Couldn't forget Tim's laptop. Try again.",
    );
  });

  it("shows the empty state with Pair with a computer when nothing is paired", async () => {
    const { screen, onPair } = show([]);
    expect(screen.querySelector("h2, h3")?.textContent).toBe("No computers paired");
    expect(screen.textContent).toContain(
      "Pair with a computer to see your agents, approve and send prompts.",
    );
    await press("Pair with a computer");
    expect(onPair).toHaveBeenCalled();
  });

  it("writes the day only when no endpoint is known, and the year when it isn't this one", () => {
    expect(computerMeta({ ...laptop, endpoints: [] }, now)).toBe("Paired 14 Nov");
    expect(
      computerMeta(
        { ...laptop, endpoints: ["tcp://192.168.1.20:4100"], pairedAt: "2025-11-14T10:00:00Z" },
        now,
      ),
    ).toBe("This Wi-Fi · Paired 14 Nov 2025");
  });
});
