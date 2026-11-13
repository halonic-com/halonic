// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentSandboxHost } from "../api.ts";
import { click } from "../test-support/controls.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { AgentSandboxHostView } from "./agent-sandbox-section.tsx";
import type { SandboxCheckFacts, SandboxOutcome } from "./sandbox-state.ts";
import { checkedAtLabel } from "./sandbox-state.ts";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
  vi.useRealTimers();
});

/** A host whose check and commands the test answers when it chooses. */
function fakeHost(first: SandboxCheckFacts, runningNow: "setup" | "remove" | null = null) {
  let check = first;
  let ends: (outcome: SandboxOutcome | null) => void = () => {};
  const signals: (AbortSignal | undefined)[] = [];
  const command = (options?: { readonly signal?: AbortSignal }) => {
    signals.push(options?.signal);
    return new Promise<SandboxOutcome | null>((resolve) => (ends = resolve));
  };
  const host = {
    available: true,
    check: vi.fn(async () => check),
    running: vi.fn(async () => runningNow),
    setUp: vi.fn(command),
    remove: vi.fn(command),
    follow: vi.fn((_verb: "setup" | "remove", options?: { readonly signal?: AbortSignal }) =>
      command(options),
    ),
  } satisfies AgentSandboxHost;
  return {
    host,
    signals,
    setCheck: (next: SandboxCheckFacts) => {
      check = next;
    },
    end: async (outcome: SandboxOutcome | null) => {
      await act(async () => ends(outcome));
    },
  };
}

async function show(
  host: AgentSandboxHost | undefined,
  place: "app" | "served" = "app",
  announce = vi.fn(),
) {
  const view = render(<AgentSandboxHostView host={host} place={place} announce={announce} />);
  await act(async () => {});
  return { view, announce };
}

function button(view: HTMLElement, label: string): HTMLButtonElement {
  const found = [...view.querySelectorAll("button")].find((each) =>
    each.textContent?.startsWith(label),
  );
  if (found === undefined) throw new Error(`No button "${label}" in: ${view.textContent}`);
  return found;
}

const needsSetup = { state: "needs-setup" } as const;
const ready = { state: "ready", checkedAt: "2026-11-09T09:12:00" } as const;

verifies("settings.agent-sandbox-section", () => {
  it("shows Needs setting up and starts nothing by itself", async () => {
    const { host } = fakeHost(needsSetup);
    const { view } = await show(host);
    expect(view.textContent).toContain("Needs setting up");
    expect(view.textContent).toContain("Windows asks for administrator rights once.");
    expect(button(view, "Set up the sandbox")).toBeDefined();
    expect(host.setUp).not.toHaveBeenCalled();
    expect(host.remove).not.toHaveBeenCalled();
  });

  it("reads Not available, with no button, when the app gives no host", async () => {
    const { view } = await show(undefined);
    expect(view.textContent).toContain("Not available");
    expect(view.querySelectorAll("button")).toHaveLength(0);
  });

  it("shows view only, with Check again, in served Studio", async () => {
    const { host } = fakeHost(needsSetup);
    const { view } = await show(host, "served");
    expect(view.textContent).toContain("View only here.");
    expect(() => button(view, "Set up the sandbox")).toThrow();
    expect(button(view, "Check again")).toBeDefined();
  });

  it("sets up on a press: busy button and steps, then Ready and a spoken result", async () => {
    const { host, end, setCheck } = fakeHost(needsSetup);
    const { view, announce } = await show(host);
    await click(button(view, "Set up the sandbox"));
    expect(host.setUp).toHaveBeenCalledTimes(1);
    expect(view.textContent).toContain("Setting up…");
    expect(view.textContent).toContain("Windows is asking for administrator rights.");
    expect(button(view, "Setting up…").getAttribute("aria-busy")).toBe("true");
    await click(button(view, "Setting up…"));
    expect(host.setUp).toHaveBeenCalledTimes(1);

    setCheck({ state: "ready", checkedAt: new Date().toISOString() });
    await end(null);
    expect(view.textContent).toContain("Ready");
    expect(view.textContent).toContain("Checked today at");
    expect(button(view, "Remove the sandbox…")).toBeDefined();
    expect(announce).toHaveBeenCalledWith(expect.stringContaining("Sandbox set up. Checked today"));
  });

  it("says a refused administrator prompt, with Try again that asks the host again", async () => {
    const { host, end } = fakeHost(needsSetup);
    const { view } = await show(host);
    await click(button(view, "Set up the sandbox"));
    await end({ kind: "setup", how: "cancelled" });
    expect(view.textContent).toContain("Windows didn't give Halonic administrator rights.");
    await click(button(view, "Try again"));
    expect(host.setUp).toHaveBeenCalledTimes(2);
  });

  it("reads Needs repair when the check after a setup doesn't pass", async () => {
    const { host, end, setCheck } = fakeHost(needsSetup);
    const { view } = await show(host);
    await click(button(view, "Set up the sandbox"));
    setCheck({ state: "needs-repair", reason: "the sandbox's Linux image isn't installed." });
    await end(null);
    expect(view.textContent).toContain("Needs repair");
    expect(view.textContent).toContain("didn't pass its check: the sandbox's Linux image");
    expect(button(view, "Repair the sandbox")).toBeDefined();
  });

  it("asks for a restart, not a repair, when the check after a setup says Windows must restart", async () => {
    const { host, end, setCheck } = fakeHost(needsSetup);
    const { view } = await show(host);
    await click(button(view, "Set up the sandbox"));
    setCheck({ state: "restart-needed" });
    await end(null);
    expect(view.textContent).toContain("Restart needed");
    expect(view.textContent).toContain("Windows needs to restart to finish setting up the sandbox.");
    expect(view.textContent).not.toContain("Needs repair");
    expect(view.textContent).not.toContain("didn't pass its check");
    expect(() => button(view, "Repair the sandbox")).toThrow();
    expect(button(view, "Check again")).toBeDefined();
  });

  it("says a setup took 3 minutes and leaves it running", async () => {
    vi.useFakeTimers();
    const { host } = fakeHost(needsSetup);
    const { view } = await show(host);
    await click(button(view, "Set up the sandbox"));
    await act(async () => {
      vi.advanceTimersByTime(3 * 60 * 1000 - 1);
    });
    expect(view.textContent).not.toContain("didn't finish within 3 minutes");
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(view.textContent).toContain(
      "The sandbox isn't set up: the setup didn't finish within 3 minutes.",
    );
    expect(host.setUp).toHaveBeenCalledTimes(1);
    await click(button(view, "Try again"));
    expect(host.setUp).toHaveBeenCalledTimes(2);
  });

  it("stops following the command when Settings closes", async () => {
    const { host, signals } = fakeHost(needsSetup);
    const { view } = await show(host);
    await click(button(view, "Set up the sandbox"));
    expect(signals[0]?.aborted).toBe(false);
    unmountAll();
    expect(signals[0]?.aborted).toBe(true);
  });

  it("stops following the first command when Try again starts a second", async () => {
    vi.useFakeTimers();
    const { host, signals } = fakeHost(needsSetup);
    const { view } = await show(host);
    await click(button(view, "Set up the sandbox"));
    await act(async () => {
      vi.advanceTimersByTime(3 * 60 * 1000);
    });
    await click(button(view, "Try again"));
    expect(signals.map((signal) => signal?.aborted)).toEqual([true, false]);
  });

  it("shows Setting up when a setup already runs in the host, and Ready when it ends", async () => {
    const { host, end, setCheck } = fakeHost(needsSetup, "setup");
    const { view } = await show(host);
    expect(view.textContent).toContain("Setting up…");
    expect(host.follow).toHaveBeenCalledWith("setup", expect.anything());
    expect(host.setUp).toHaveBeenCalledTimes(0);
    expect(host.remove).toHaveBeenCalledTimes(0);
    expect(view.textContent).not.toContain("Windows is asking for administrator rights.");
    setCheck(ready);
    await end(null);
    expect(view.textContent).toContain("Ready");
  });

  it("says a repair took 3 minutes in the words of a repair", async () => {
    vi.useFakeTimers();
    const { host } = fakeHost({ state: "needs-repair", reason: "the image is missing." });
    const { view } = await show(host);
    await click(button(view, "Repair the sandbox"));
    await act(async () => {
      vi.advanceTimersByTime(3 * 60 * 1000);
    });
    expect(view.textContent).toContain(
      "The sandbox isn't repaired: the repair didn't finish within 3 minutes.",
    );
  });

  it("asks before removing: Cancel removes nothing, Remove sandbox does", async () => {
    const { host, end, setCheck } = fakeHost(ready);
    const { view } = await show(host);
    await click(button(view, "Remove the sandbox…"));
    const dialog = document.querySelector("dialog[open]");
    expect(dialog?.textContent).toContain("Remove the agent sandbox?");
    expect(dialog?.textContent).toContain("Windows asks for administrator rights once.");
    await click(button(dialog as HTMLElement, "Cancel"));
    expect(host.remove).not.toHaveBeenCalled();

    await click(button(view, "Remove the sandbox…"));
    await click(button(document.querySelector("dialog[open]") as HTMLElement, "Remove sandbox"));
    expect(host.remove).toHaveBeenCalledTimes(1);
    setCheck(needsSetup);
    await end(null);
    expect(view.textContent).toContain("Needs setting up");
  });

  it("says how many runs use the sandbox when the removal is refused, with no Try again", async () => {
    const { host, end } = fakeHost(ready);
    const { view } = await show(host);
    await click(button(view, "Remove the sandbox…"));
    await click(button(document.querySelector("dialog[open]") as HTMLElement, "Remove sandbox"));
    await end({ kind: "remove", how: "in-use", runs: 1 });
    expect(view.textContent).toContain("The sandbox wasn't removed: 1 run is using it.");
    expect(() => button(view, "Try again")).toThrow();
  });

  it("words when it checked", () => {
    const now = new Date(2026, 10, 9, 12, 0);
    expect(checkedAtLabel(new Date(2026, 10, 9, 9, 12).toISOString(), now)).toBe("today at 09:12");
    expect(checkedAtLabel(new Date(2026, 10, 8, 9, 12).toISOString(), now)).toBe(
      "yesterday at 09:12",
    );
    expect(checkedAtLabel(new Date(2026, 10, 3, 9, 12).toISOString(), now)).toBe("3 Nov at 09:12");
  });
});
