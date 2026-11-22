// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import type { ComputerId, ForgetOutcome, PairedComputer } from "./phone-tunnel.ts";
import { type Standing, StandingScreen } from "./standing-screen.tsx";

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

const laptop: PairedComputer = {
  id: "c-1" as ComputerId,
  name: "Tim's laptop",
  pairedAt: new Date(2026, 10, 14, 10, 0).toISOString(),
  endpoints: ["wss://studio.tail1234.ts.net"],
  standing: "removed",
};

function show(
  standing: Standing,
  onForget: () => Promise<ForgetOutcome> = async () => ({ kind: "forgotten" }),
) {
  const onPairAgain = vi.fn();
  const onForgotten = vi.fn();
  const screen = render(
    <StandingScreen
      standing={standing}
      computer={{ ...laptop, standing: standing === "removed" ? "removed" : "cant-confirm" }}
      onPairAgain={onPairAgain}
      onForget={onForget}
      onForgotten={onForgotten}
    />,
  );
  return { screen, onPairAgain, onForgotten };
}

const button = (text: string, within: ParentNode = document) =>
  [...within.querySelectorAll("button")].find((each) => each.textContent?.trim() === text);

/** The open question's Forget, pressed. */
const confirmForget = async () => {
  const sheet = document.querySelector("dialog") ?? undefined;
  const confirm = [...(sheet?.querySelectorAll("button") ?? [])].find((each) =>
    each.textContent?.startsWith("Forget"),
  );
  expect(confirm).toBeDefined();
  await act(async () => confirm?.click());
};

const press = async (text: string, within?: ParentNode) => {
  const found = button(text, within);
  expect(found, text).toBeDefined();
  await act(async () => found?.click());
};

verifies("remote.phone-standing", () => {
  it("says Removed, what was cleared and that the agents are not affected", async () => {
    const before = document.activeElement;
    const { screen, onPairAgain } = show("removed");
    expect(screen.querySelector("h2")?.textContent).toBe("Removed from Tim's laptop");
    expect(screen.textContent).toContain(
      "This phone can't see agents there any more. What it saved from that computer is cleared. Your agents there are not affected.",
    );
    expect(screen.textContent).not.toContain("Nothing on this phone was cleared.");
    // The header's live region said the state; focus stays where it was.
    expect(document.activeElement).toBe(before);
    await press("Pair again");
    expect(onPairAgain).toHaveBeenCalledOnce();
  });

  it("says Can't confirm, why it happens, and that nothing was cleared", () => {
    const { screen } = show("cantConfirm");
    expect(screen.querySelector("h2")?.textContent).toBe("Can't confirm it's Tim's laptop");
    expect(screen.textContent).toContain(
      "Its identity changed since you paired, so this phone won't connect. That happens after Halonic is reinstalled or the computer is restored from a backup. If neither happened, check the computer before you pair again.",
    );
    expect(screen.textContent).toContain("Nothing on this phone was cleared.");
    expect(button("Pair again")).toBeDefined();
    expect(button("Forget this computer")).toBeDefined();
  });

  it.each(["removed", "cantConfirm"] as const)(
    "asks once before Forget this computer on %s, and changes nothing on Cancel",
    async (standing) => {
      const onForget = vi.fn(async (): Promise<ForgetOutcome> => ({ kind: "forgotten" }));
      const { onForgotten } = show(standing, onForget);
      await press("Forget this computer");
      const sheet = document.querySelector("dialog");
      expect(sheet?.textContent).toContain("Forget Tim's laptop?");
      expect(sheet?.textContent).toContain("The computer still lists this phone as paired.");
      await press("Cancel", sheet ?? undefined);
      expect(document.querySelector("dialog")).toBeNull();
      expect(onForget).not.toHaveBeenCalled();

      await press("Forget this computer");
      await confirmForget();
      expect(onForget).toHaveBeenCalledOnce();
      expect(onForgotten).toHaveBeenCalledOnce();
      expect(document.querySelector("dialog")).toBeNull();
    },
  );

  it("keeps the question open with the reason when Forget fails", async () => {
    const { onForgotten } = show("removed", async () => {
      throw new Error("shell");
    });
    await press("Forget this computer");
    await confirmForget();
    // The dialog's alert slot fills a frame after the request ends.
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    expect(document.querySelector("dialog")?.textContent).toContain(
      "Couldn't forget Tim's laptop. Try again.",
    );
    expect(onForgotten).not.toHaveBeenCalled();
  });
});
