// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentSandboxHost } from "../api.ts";
import { click } from "../test-support/controls.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { AgentSandboxHostView } from "./agent-sandbox-section.tsx";
import { type SandboxCheckFacts, type SandboxOutcome, sandboxView } from "./sandbox-state.ts";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

const ready = { state: "ready", checkedAt: "2026-11-09T09:12:00" } as const;

/** A Ready host whose removal ends when the test says, and whose check then says `after`. */
async function readyHost() {
  let check: SandboxCheckFacts = ready;
  let ends: (outcome: SandboxOutcome | null) => void = () => {};
  const host = {
    available: true,
    check: async () => check,
    running: async () => null,
    setUp: async () => null,
    remove: () => new Promise<SandboxOutcome | null>((resolve) => (ends = resolve)),
    follow: async () => null,
  } satisfies AgentSandboxHost;
  const announce = vi.fn();
  const view = render(<AgentSandboxHostView host={host} place="app" announce={announce} />);
  await act(async () => {});
  const end = async (outcome: SandboxOutcome | null, after: SandboxCheckFacts = ready) => {
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

function calloutOf(outcome: SandboxOutcome) {
  return sandboxView({ available: true, place: "app", check: ready, running: null, outcome })
    .callout;
}

verifies("settings.agent-sandbox-removal-result", () => {
  it("moves focus to the removal's step when the dialog closes", async () => {
    const { view } = await readyHost();
    await removeFrom(view);
    expect(document.activeElement?.tagName).toBe("OL");
    expect(document.activeElement?.textContent).toContain("Removing the agent sandbox…");
  });

  it("says a removal that worked once, in the first line of the state it left", async () => {
    const { view, announce, end } = await readyHost();
    await removeFrom(view);
    await end(null, { state: "needs-setup" });
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(
      "The sandbox needs a one-time setup with administrator rights. Until then, agents set to run in a sandbox don't start.",
    );
  });

  it("says the time limit in the setup's words, on screen and once out loud", async () => {
    const { view, announce, end } = await readyHost();
    await removeFrom(view);
    await end({ kind: "remove", how: "timed-out" });
    const line = "The sandbox wasn't removed: the removal didn't finish within 5 minutes.";
    expect(view.textContent).toContain(line);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(line);
  });

  it("shows an earlier removal still running as a note, not a failure", async () => {
    const { view, announce, end } = await readyHost();
    await removeFrom(view);
    await end({ kind: "remove", how: "still-running" });
    const line = "The earlier removal is still running. Wait a minute, then try again.";
    expect(view.textContent).toContain(line);
    expect(announce).toHaveBeenCalledWith(line);
    expect(calloutOf({ kind: "remove", how: "still-running" })).toEqual({
      line,
      action: null,
      note: true,
    });
    expect(calloutOf({ kind: "remove", how: "timed-out" })?.note).toBeUndefined();
  });
});
