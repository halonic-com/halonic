// @vitest-environment jsdom
import { type SandboxStartResult, sandboxStartWords } from "@halonicjs/app";
import type { RunEvent } from "@halonicjs/events";
import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { RunStartHost } from "../api.ts";
import { RunsList } from "../runs-list.ts";
import { fakeSource } from "../source.test-helper.ts";
import { mondayMorning, summaryWith } from "../summary.test-helper.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { RunView } from "./run-page.tsx";

afterEach(unmountAll);

const failedRun = summaryWith({
  id: "run_a_7k2m9p",
  status: "failed",
  reason: "sandbox-not-ready",
  error: "not ready",
  endedAt: mondayMorning.toISOString(),
});

const log = (sandboxReason?: string): RunEvent[] => [
  {
    runId: failedRun.id,
    seq: 1,
    at: "2026-11-16T08:00:00Z",
    type: "run.failed",
    state: "draft",
    error: "not ready",
    reason: "sandbox-not-ready",
    ...(sandboxReason === undefined ? {} : { sandboxReason }),
  } as RunEvent,
];

async function open(
  events: RunEvent[] | undefined,
  check?: () => Promise<SandboxStartResult>,
  phone = false,
  announce?: (line: string) => void,
  runStart?: RunStartHost,
) {
  const list = new RunsList(
    fakeSource([failedRun], events ? { [failedRun.id]: events } : {}).source,
  );
  const root = render(
    <PresentationProvider presentation={phone ? "phone" : "desktop"}>
      <RunView
        list={list}
        runId={failedRun.id}
        now={() => mondayMorning}
        {...(announce === undefined ? {} : { announce })}
        {...(check === undefined ? {} : { sandboxStartCheck: { check } })}
        {...(runStart === undefined ? {} : { runStart, openRun: () => {} })}
      />
    </PresentationProvider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return root;
}

const banner = (root: HTMLElement) => root.querySelector('section[aria-label="Run failed"]');
const button = (root: HTMLElement) =>
  [...root.querySelectorAll("button")].find((b) => b.textContent === "Check again");

verifies("runs.run-view.sandbox-not-ready", () => {
  it("says what is wrong and the fix, from the catalogue, then that nothing ran", async () => {
    const words = sandboxStartWords("bubblewrap-missing");
    const root = await open(log("bubblewrap-missing"), async () => ({ ok: true }));

    expect(banner(root)?.textContent).toBe(
      `Support reply didn't start: the sandbox can't start on this computer.${words.reason}${words.calloutFix}Nothing ran.Read the guide ↗ (opens in your browser)Check again`,
    );
  });

  it("reads a missing or unknown code as other", async () => {
    const other = sandboxStartWords("other");
    for (const events of [log(), log("from-the-future")]) {
      const root = await open(events);
      expect(banner(root)?.textContent).toContain(other.reason);
      unmountAll();
    }
  });

  it("has no button where nothing can check, and never offers to run anyway", async () => {
    const root = await open(log("bubblewrap-missing"));
    expect(button(root)).toBeUndefined();
    expect(root.textContent?.toLowerCase()).not.toContain("anyway");
  });

  it("turns calm and drops the button when the check passes, without running anything", async () => {
    const check = vi.fn(async (): Promise<SandboxStartResult> => ({ ok: true }));
    const root = await open(log("bubblewrap-missing"), check);
    await act(async () => button(root)?.click());

    expect(check).toHaveBeenCalledTimes(1);
    expect(banner(root)?.textContent).toContain(
      "The sandbox works now. You can run Support reply.",
    );
    expect(button(root)).toBeUndefined();
  });

  it("turns Check again into Run again when the check passes, where the page can run again", async () => {
    const events = [
      {
        runId: failedRun.id,
        seq: 0,
        at: "2026-11-16T08:00:00Z",
        type: "run.started",
        hubId: "acme",
        workflowId: "support-reply",
        input: {},
        kind: "run",
        definitionsVersion: "v1",
      } as RunEvent,
      ...log("bubblewrap-missing"),
    ];
    const root = await open(events, async () => ({ ok: true }), false, undefined, {
      startRun: vi.fn(),
    });
    const inBanner = () => [...(banner(root)?.querySelectorAll("button") ?? [])];
    expect(inBanner().map((one) => one.textContent)).toEqual(["Check again"]);
    await act(async () => button(root)?.click());
    expect(inBanner().map((one) => one.textContent)).toEqual(["Run again"]);
  });

  it("links the guide for the reason", async () => {
    const root = await open(log("bubblewrap-missing"));
    const link = banner(root)?.querySelector("a");
    expect(link?.textContent).toContain("Read the guide");
    expect(link?.getAttribute("href")).toBe(
      `https://docs.halonic.dev/${sandboxStartWords("bubblewrap-missing").docsKey}`,
    );
  });

  it("shows the new reason when the sandbox still can't start, and keeps the button", async () => {
    const root = await open(log("bubblewrap-missing"), async () => ({
      ok: false,
      reason: "ripgrep-missing",
    }));
    await act(async () => button(root)?.click());

    expect(banner(root)?.textContent).toContain(sandboxStartWords("ripgrep-missing").reason);
    expect(button(root)).toBeDefined();
  });

  it("says so when the check itself fails", async () => {
    const root = await open(log("bubblewrap-missing"), async () => {
      throw new Error("host sentence");
    });
    await act(async () => button(root)?.click());

    expect(banner(root)?.textContent).toContain("Halonic couldn't check the sandbox. Try again.");
    expect(banner(root)?.textContent).not.toContain("host sentence");
    expect(button(root)).toBeDefined();
  });

  it("keeps the last known code when a later check can't run", async () => {
    const results = [
      async (): Promise<SandboxStartResult> => ({ ok: false, reason: "ripgrep-missing" }),
      async (): Promise<SandboxStartResult> => {
        throw new Error("host sentence");
      },
    ];
    let call = 0;
    const root = await open(log("bubblewrap-missing"), () => {
      const next = results[Math.min(call++, results.length - 1)];
      if (next === undefined) throw new Error("no result");
      return next();
    });
    await act(async () => button(root)?.click());
    await act(async () => button(root)?.click());

    expect(banner(root)?.textContent).toContain("Halonic couldn't check the sandbox. Try again.");
    expect(banner(root)?.textContent).toContain(sandboxStartWords("ripgrep-missing").reason);
    expect(banner(root)?.textContent).not.toContain(sandboxStartWords("bubblewrap-missing").reason);
  });

  it("keeps the button, busy and focused, while a check runs, and says the answer once", async () => {
    let finish: (result: SandboxStartResult) => void = () => {};
    const announce = vi.fn();
    const root = await open(
      log("bubblewrap-missing"),
      () => new Promise((resolve) => (finish = resolve)),
      false,
      announce,
    );
    const pressed = button(root);
    act(() => {
      pressed?.focus();
      pressed?.click();
    });

    expect(button(root)).toBe(pressed);
    expect(pressed?.getAttribute("aria-busy")).toBe("true");
    expect(document.activeElement).toBe(pressed);
    expect(announce).not.toHaveBeenCalled();

    await act(async () => finish({ ok: false, reason: "ripgrep-missing" }));
    expect(button(root)).toBe(pressed);
    expect(document.activeElement).toBe(pressed);
    expect(announce).toHaveBeenCalledExactlyOnceWith(
      `Sandbox checked: not ready. ${sandboxStartWords("ripgrep-missing").reason}`,
    );
  });

  it("says the sandbox is ready and moves focus to the banner when the button goes", async () => {
    const announce = vi.fn();
    const root = await open(log("bubblewrap-missing"), async () => ({ ok: true }), false, announce);
    act(() => button(root)?.focus());
    await act(async () => button(root)?.click());

    expect(announce).toHaveBeenCalledExactlyOnceWith(
      "The sandbox works now. You can run Support reply.",
    );
    expect(document.activeElement).toBe(banner(root)?.firstElementChild);
  });

  it("says when the check itself fails", async () => {
    const announce = vi.fn();
    const root = await open(
      log("bubblewrap-missing"),
      async () => {
        throw new Error("host sentence");
      },
      false,
      announce,
    );
    await act(async () => button(root)?.click());

    expect(announce).toHaveBeenCalledExactlyOnceWith(
      "Halonic couldn't check the sandbox. Try again.",
    );
  });

  it("says the fix is for the computer on a phone", async () => {
    const root = await open(log("bubblewrap-missing"), undefined, true);
    expect(banner(root)?.textContent).toContain(sandboxStartWords("bubblewrap-missing").phoneFix);
  });

  it("names the agent run.failed records, not the last one that started in a parallel state", async () => {
    const started = (seq: number, agent: string): RunEvent =>
      ({
        runId: failedRun.id,
        seq,
        at: "2026-11-16T08:00:00Z",
        type: "agent.started",
        state: "fan",
        agent,
        prompt: "Go",
      }) as RunEvent;
    const failed = { ...log("bubblewrap-missing")[0], seq: 3, agent: "writer" } as RunEvent;
    const root = await open([started(1, "writer"), started(2, "reviewer"), failed]);

    expect(banner(root)?.textContent).toContain("Writer didn't start");
  });

  it("falls back to the last agent that started for a run logged without the agent", async () => {
    const started = {
      runId: failedRun.id,
      seq: 1,
      at: "2026-11-16T08:00:00Z",
      type: "agent.started",
      state: "draft",
      agent: "reviewer",
      prompt: "Go",
    } as RunEvent;
    const failed = { ...log("bubblewrap-missing")[0], seq: 2 } as RunEvent;
    const root = await open([started, failed]);

    expect(banner(root)?.textContent).toContain("Reviewer didn't start");
  });
});
