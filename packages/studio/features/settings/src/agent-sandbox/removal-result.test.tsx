// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentSandboxHost } from "../api.ts";
import { click } from "../test-support/controls.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { AgentSandboxHostView } from "./agent-sandbox-section.tsx";
import {
  type SandboxCheckFacts,
  type SandboxOutcome,
  type SandboxRemoved,
  type SandboxResult,
  sandboxView,
} from "./sandbox-state.ts";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const ready = { state: "ready", checkedAt: "2026-11-09T09:12:00" } as const;

/** A Ready host whose removal ends when the test says, and whose check then says `after`. */
async function readyHost() {
  let check: SandboxCheckFacts = ready;
  let ends: (outcome: SandboxOutcome | SandboxRemoved | null) => void = () => {};
  const host = {
    available: true,
    check: async () => check,
    running: async () => null,
    setUp: async () => null,
    remove: () =>
      new Promise<SandboxOutcome | SandboxRemoved | null>((resolve) => (ends = resolve)),
    follow: async () => null,
  } satisfies AgentSandboxHost;
  const announce = vi.fn();
  const view = render(<AgentSandboxHostView host={host} place="app" announce={announce} />);
  await act(async () => {});
  const end = async (
    outcome: SandboxOutcome | SandboxRemoved | null,
    after: SandboxCheckFacts = ready,
  ) => {
    check = after;
    await act(async () => ends(outcome));
  };
  return { view, announce, end };
}

function button(view: HTMLElement, label: string): HTMLButtonElement {
  const found = [...view.querySelectorAll("button")].find((each) =>
    each.textContent?.startsWith(label),
  );
  if (found === undefined) throw new Error(`No button "${label}" in: ${view.textContent}`);
  return found;
}

/** Presses Remove the sandbox… from the keyboard's focus, then Remove sandbox in the dialog. */
async function removeFrom(view: HTMLElement) {
  const opener = button(view, "Remove the sandbox…");
  act(() => opener.focus());
  await click(opener);
  await click(button(document.querySelector("dialog[open]") as HTMLElement, "Remove sandbox"));
}

/** What a screen reader says for the focused element: the text its `aria-labelledby` points at. */
function nameOfFocus(): string | undefined {
  const id = document.activeElement?.getAttribute("aria-labelledby");
  return id ? (document.getElementById(id)?.textContent ?? undefined) : undefined;
}

function calloutOf(outcome: SandboxResult) {
  return sandboxView({ available: true, place: "app", check: ready, running: null, outcome })
    .callout;
}

verifies("settings.agent-sandbox-removal-result", () => {
  it("moves focus to the removal's step when the dialog closes", async () => {
    const { view } = await readyHost();
    await removeFrom(view);
    expect(document.activeElement?.tagName).toBe("OL");
    expect(document.activeElement?.textContent).toContain("Removing the agent sandbox…");
    // Only code focuses the step, so it wears the kit's ring, not the browser's outline (C574).
    expect(document.activeElement?.classList).toContain("focus-ring");
  });

  it("says a removal that worked once: Sandbox removed, then the first line of the state it left", async () => {
    const { view, announce, end } = await readyHost();
    await removeFrom(view);
    await end(null, { state: "needs-setup" });
    // The focused note says "Sandbox removed."; the live region adds only the state's first line.
    expect(nameOfFocus()).toBe("Sandbox removed.");
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(
      "The sandbox needs a one-time setup with administrator rights. Until then, agents set to run in a sandbox don't start.",
    );
  });

  it("says a removal that kept some access until Halonic next starts, on screen and out loud", async () => {
    const kept =
      "Sandbox removed. Its access to your project folders ends the next time you start Halonic.";
    const { view, announce, end } = await readyHost();
    await removeFrom(view);
    await end(
      { kind: "remove", how: "removed", keptAccess: "until_next_start" },
      { state: "needs-setup" },
    );
    expect(view.textContent).toContain(kept);
    expect(nameOfFocus()).toBe(kept);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(calloutOf({ kind: "remove", how: "removed", keptAccess: "until_next_start" })).toEqual({
      line: kept,
      action: null,
      note: true,
    });
  });

  it("says how to end the access a removal kept when the next start doesn't end it", async () => {
    const kept =
      "Sandbox removed. It may still have access to some of your project folders. To end that, start Halonic without administrator rights and remove the sandbox again.";
    const { view, announce, end } = await readyHost();
    await removeFrom(view);
    await end({ kind: "remove", how: "removed", keptAccess: "manual" }, { state: "needs-setup" });
    expect(view.textContent).toContain(kept);
    expect(nameOfFocus()).toBe(kept);
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it("says a followed removal that kept some access through the live region", async () => {
    const host = {
      available: true,
      check: async () => ({ state: "needs-setup" }) as const,
      running: async () => "remove" as const,
      setUp: async () => null,
      remove: async () => null,
      follow: async () =>
        ({ kind: "remove", how: "removed", keptAccess: "until_next_start" }) as const,
    } satisfies AgentSandboxHost;
    const announce = vi.fn();
    render(<AgentSandboxHostView host={host} place="app" announce={announce} />);
    await act(async () => {});
    expect(announce).toHaveBeenCalledWith(
      expect.stringMatching(
        /^Sandbox removed\. Its access to your project folders ends the next time you start Halonic\. The sandbox needs/,
      ),
    );
  });

  it("says the time limit and what to do next, on screen and once out loud", async () => {
    const { view, announce, end } = await readyHost();
    await removeFrom(view);
    await end({ kind: "remove", how: "timed-out" });
    const line = "The sandbox wasn't removed within 5 minutes. Wait a minute, then try again.";
    expect(view.textContent).toContain(line);
    // The focused Callout says the line, so the live region doesn't say it again (C574).
    expect(nameOfFocus()).toBe(line);
    expect(announce).not.toHaveBeenCalled();
  });

  it("says the result of a removal it only followed through the live region", async () => {
    let ends: (outcome: SandboxOutcome | null) => void = () => {};
    const host = {
      available: true,
      check: async () => ready,
      running: async () => "remove" as const,
      setUp: async () => null,
      remove: async () => null,
      follow: () => new Promise<SandboxOutcome | null>((resolve) => (ends = resolve)),
    } satisfies AgentSandboxHost;
    const announce = vi.fn();
    render(<AgentSandboxHostView host={host} place="app" announce={announce} />);
    await act(async () => {});
    await act(async () => ends({ kind: "remove", how: "timed-out" }));
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(
      "The sandbox wasn't removed within 5 minutes. Wait a minute, then try again.",
    );
  });

  it("shows an earlier removal still running as a note, not a failure", async () => {
    const { view, announce, end } = await readyHost();
    await removeFrom(view);
    await end({ kind: "remove", how: "still-running" });
    const line = "The earlier removal is still running. Wait a minute, then try again.";
    expect(view.textContent).toContain(line);
    expect(nameOfFocus()).toBe(line);
    expect(announce).not.toHaveBeenCalled();
    expect(calloutOf({ kind: "remove", how: "still-running" })).toEqual({
      line,
      action: null,
      note: true,
    });
    expect(calloutOf({ kind: "remove", how: "timed-out" })?.note).toBeUndefined();
  });

  it("shows a removal that worked as a Sandbox removed note", async () => {
    const { view, end } = await readyHost();
    await removeFrom(view);
    await end(null, { state: "needs-setup" });
    expect(view.textContent).toContain("Sandbox removed.");
    expect(view.textContent).toContain("Needs setting up");
    expect(calloutOf({ kind: "remove", how: "removed" })).toEqual({
      line: "Sandbox removed.",
      action: null,
      note: true,
    });
  });

  it.each([
    ["worked", null, "Sandbox removed."],
    ["timed out", { kind: "remove", how: "timed-out" }, "within 5 minutes"],
    ["found an earlier one running", { kind: "remove", how: "still-running" }, "still running"],
    ["was cancelled", { kind: "remove", how: "cancelled" }, "administrator rights"],
    ["found runs using it", { kind: "remove", how: "in-use", runs: 2 }, "2 runs are using it"],
    ["failed", { kind: "remove", how: "failed", reason: "disk full." }, "disk full."],
  ] as const)(
    "moves focus to the result when a removal that %s ends",
    async (_, outcome, words) => {
      const { view, end } = await readyHost();
      await removeFrom(view);
      await end(outcome, { state: "needs-setup" });
      expect(document.activeElement).not.toBe(document.body);
      expect(view.contains(document.activeElement)).toBe(true);
      expect(document.activeElement?.textContent).toContain(words);
    },
  );
});
