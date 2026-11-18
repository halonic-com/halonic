// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fakeSetups, setupEntry } from "../fake-setups.test-helper.ts";
import { refusedRun, sandboxInbox } from "../sandbox/fake-sandbox.test-helper.ts";
import { fakeModal, restoreModal } from "../test-support/modal.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { InboxView } from "./inbox-page.tsx";
import { SandboxSetupView } from "./sandbox-setup-view.tsx";

beforeEach(fakeModal);
afterEach(() => {
  unmountAll();
  restoreModal();
});

async function settled(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Wait until `done` holds, a tick at a time, instead of guessing how many ticks the page needs. */
async function until(done: () => unknown): Promise<void> {
  for (let tries = 0; tries < 100 && !done(); tries++) await settled();
}

const now = () => new Date("2026-11-10T12:30:00.000Z");
const twoRoutines = [
  refusedRun("a", "daily", "2026-11-10T06:00:00.000Z"),
  refusedRun("c", "weekly", "2026-11-10T08:00:00.000Z"),
];

/** The page with the sandbox card open: `openSetup` asks for it, as Home's Needs you would. */
async function openCard(
  t: ReturnType<typeof sandboxInbox>,
  openRun?: (hubId: string, runId: string) => void,
  announce?: (line: string) => void,
) {
  await settled();
  t.inbox.openSetup("sandbox", "this-computer");
  const root = render(
    <InboxView inbox={t.inbox} now={now} openRun={openRun} announce={announce} />,
  );
  await until(() => root.querySelector("section h2"));
  return root;
}

const button = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll("button")].find((b) => b.textContent?.startsWith(name));

verifies("inbox.sandbox-row", () => {
  it("shows the reason, then the fix, the guide and the runs that didn't run", async () => {
    const root = await openCard(sandboxInbox(twoRoutines));
    await until(() => root.textContent?.includes("Daily summary"));
    const card = root.querySelector("section") as HTMLElement;
    expect(card.querySelector("h2")?.textContent).toBe("2 routines didn't run");
    expect(card.textContent).toContain("bubblewrap isn't installed, and the sandbox needs it.");
    expect(card.textContent).toContain("Install it, for example on Ubuntu or Debian");
    expect(card.querySelector("a")?.getAttribute("href")).toBe(
      "https://docs.halonic.dev/security/sandbox/#bubblewrap",
    );
    expect(card.textContent).toContain("Didn't run because of this");
    expect(card.textContent).toContain("Weekly report");
    expect(card.textContent).toContain("Daily summary");
    expect(card.textContent).not.toContain("acme/");
  });

  it("opens a run from its line", async () => {
    const openRun = vi.fn();
    const root = await openCard(sandboxInbox(twoRoutines), openRun);
    // The run lines load after the card opens.
    await until(() => button(root, "Open run"));
    act(() => button(root, "Open run")?.click());
    expect(openRun).toHaveBeenCalledWith("acme", "c");
  });

  it("says Fixed in the row and the card when the check passes, and drops the count", async () => {
    const t = sandboxInbox(twoRoutines);
    const root = await openCard(t);
    await act(async () => button(root, "Check again")?.click());
    await until(() => root.querySelector("section h2")?.textContent === "The sandbox is ready");
    expect(t.inbox.signal().value).toBe(0);
    const card = root.querySelector("section") as HTMLElement;
    expect(card.querySelector("h2")?.textContent).toBe("The sandbox is ready");
    expect(card.textContent).toContain("Fixed");
    expect(card.textContent).toContain("Routines start again at their next time");
    expect(card.textContent).not.toContain("Nothing ran again by itself");
    expect(card.querySelector(".text-success")).not.toBeNull();
    expect(root.querySelector('[role="grid"]')?.textContent).toContain("Fixed");
    expect(button(root, "Check again")).toBeUndefined();
  });

  it("keeps Check again focused while a check runs, and says the fix when it passes", async () => {
    const announce = vi.fn();
    const root = await openCard(sandboxInbox(twoRoutines), undefined, announce);
    const pressed = button(root, "Check again");
    act(() => {
      pressed?.focus();
      pressed?.click();
    });

    expect(button(root, "Check again")).toBe(pressed);
    expect(pressed?.getAttribute("aria-busy")).toBe("true");
    expect(pressed?.textContent).toContain("Checking…");
    expect(document.activeElement).toBe(pressed);

    await until(() => root.querySelector("section h2")?.textContent === "The sandbox is ready");
    expect(announce).toHaveBeenCalledWith("Sandbox checked: ready.");
    expect(document.activeElement?.textContent).toContain("Routines start again");
  });

  it("keeps Check again and shows the new reason while the sandbox is still refused", async () => {
    const t = sandboxInbox(twoRoutines, { ok: false, reason: "ripgrep-missing" });
    const root = await openCard(t);
    await act(async () => button(root, "Check again")?.click());
    await settled();
    expect(root.querySelector("section")?.textContent).toContain(
      "ripgrep isn't installed, and the sandbox needs it.",
    );
    expect(button(root, "Check again")).toBeDefined();
  });

  it("says so and keeps Check again when the check can't run", async () => {
    const t = sandboxInbox(twoRoutines);
    const root = await openCard(t);
    t.throwOnCheck();
    await act(async () => button(root, "Check again")?.click());
    await settled();
    expect(root.querySelector("section")?.textContent).toContain(
      "Halonic couldn't check the sandbox. Try again.",
    );
    expect(button(root, "Check again")).toBeDefined();
  });

  it("lets the fixed row go when you leave the item", async () => {
    const t = sandboxInbox(twoRoutines);
    const root = await openCard(t);
    await act(async () => button(root, "Check again")?.click());
    await until(() => root.querySelector("section h2")?.textContent === "The sandbox is ready");
    expect(t.inbox.state.items).toHaveLength(1);
    act(() => root.querySelector<HTMLElement>('[role="gridcell"]')?.focus());
    // Closing the card (Escape) leaves the item.
    act(() => {
      root
        .querySelector("section")
        ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await until(() => t.inbox.state.items.length === 0);
    expect(t.inbox.state.items).toEqual([]);
  });

  it("keeps the fixed item while its card is open across a refresh", async () => {
    const t = sandboxInbox(twoRoutines);
    const root = await openCard(t);
    await act(async () => button(root, "Check again")?.click());
    await settled();
    await act(async () => {
      await t.inbox.refresh();
    });
    await settled();
    expect(t.inbox.state.items).toHaveLength(1);
    expect(root.querySelector("section h2")?.textContent).toBe("The sandbox is ready");
  });

  it("lets the fixed row go when you move to another setup item", async () => {
    const t = sandboxInbox(twoRoutines);
    t.inbox.addSetupSource(
      fakeSetups("google", [setupEntry("acct-1", "2026-11-10T11:00:00.000Z")]).source,
    );
    const root = await openCard(t);
    await act(async () => button(root, "Check again")?.click());
    await settled();
    expect(t.inbox.state.items).toHaveLength(2);
    act(() => t.inbox.openSetup("google", "acct-1"));
    await settled();
    expect(t.inbox.state.items.map((item) => item.key)).toEqual(["setup:google:acct-1"]);
  });

  it("has no way to run anyway", async () => {
    const t = sandboxInbox(twoRoutines);
    const root = await openCard(t);
    const labels = [...root.querySelectorAll("button")].map((b) => b.textContent ?? "");
    expect(labels.join(" ")).not.toMatch(/anyway|ignore|skip|run without|continue/i);
    expect(root.textContent).not.toMatch(/run anyway/i);
  });

  it("says it couldn't load the runs that didn't run, and Try again loads them", async () => {
    let fail = true;
    const [run] = twoRoutines;
    const root = render(
      <SandboxSetupView
        item={{
          kind: "setup",
          key: "setup:sandbox:this-computer",
          provider: "sandbox",
          account: "this-computer",
          title: "1 routine didn't run",
          progress: "",
          changedAt: "2026-11-10T06:00:00.000Z",
        }}
        control={{
          check: async () => ({ ok: true }),
          reason: () => "bubblewrap-missing",
          runs: async () => {
            if (fail) throw new Error("no store");
            return run === undefined ? [] : [run];
          },
          name: () => "Daily summary",
        }}
        answering
        close={() => {}}
      />,
    );
    await until(() => root.textContent?.includes("Couldn't load"));
    expect(root.textContent).toContain("Couldn't load the runs that didn't run.");
    expect(root.textContent).not.toContain("Didn't run because of this");

    fail = false;
    await act(async () => button(root, "Try again")?.click());
    await until(() => root.textContent?.includes("Daily summary"));
    expect(root.textContent).toContain("Didn't run because of this");
    expect(root.textContent).not.toContain("Couldn't load the runs");
  });
});
