// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { AgentSettings } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import type { Load } from "../page/use-load.ts";
import { buttonNamed, show, unmount } from "../test-support.tsx";
import { TryItPanel } from "./try-it-panel.tsx";

afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const sorter = { hubId: "acme", id: "sorter" };
const host = memoryAgentsHost({
  hubs: [{ id: "acme", name: "Acme" }],
  agents: [{ ...sorter, name: "Sorter", description: "Sorts incoming mail by topic" }],
});
const ways = { goToKeyField: vi.fn(), openHarness: vi.fn() };

function panel(settings: Load<AgentSettings>, retry = vi.fn()) {
  return (
    <TryItPanel
      host={host}
      agent={sorter}
      settings={settings}
      retry={retry}
      ways={ways}
      announce={vi.fn()}
    />
  );
}

const status = (page: HTMLElement) => page.querySelector('[role="status"]')?.textContent;

verifies("agents.chat.first-load", () => {
  it("shows nothing for 300 ms, then the skeleton lines, then Still loading with Try again", async () => {
    vi.useFakeTimers();
    const retry = vi.fn();
    const page = await show(panel({ kind: "loading", skeleton: false, slow: false }, retry));
    expect(status(page)).toBe("");
    await act(async () => vi.advanceTimersByTime(300));
    expect(status(page)).toBe("Loading this chat");
    expect(buttonNamed(page, "Try again")).toBeUndefined();
    await act(async () => vi.advanceTimersByTime(10_000));
    expect(status(page)).toBe("Still loading");
    await act(async () => buttonNamed(page, "Try again")?.click());
    expect(retry).toHaveBeenCalledOnce();
  });

  it("says it couldn't load this chat, with the reason and Try again", async () => {
    const retry = vi.fn();
    const reason = "The engine isn't answering. It may still be starting.";
    const page = await show(panel({ kind: "failed", reason, retrying: false }, retry));
    expect(page.querySelector("h2")?.textContent).toBe("Couldn't load this chat");
    expect(page.textContent).toContain(reason);
    await act(async () => buttonNamed(page, "Try again")?.click());
    expect(retry).toHaveBeenCalledOnce();
  });

  it("shows the chat once the agent is read", async () => {
    const settings = await host.settings(sorter);
    const page = await show(panel({ kind: "ready", value: settings }));
    expect(page.querySelector("h2")?.textContent).toBe("Chat with Sorter");
    expect(page.textContent).toContain("Sorts incoming mail by topic");
    expect(page.querySelector("textarea")?.getAttribute("placeholder")).toBe("Message Sorter…");
  });
});
