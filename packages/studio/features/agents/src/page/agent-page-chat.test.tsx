// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { AgentsHost, HarnessReadiness } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { buttonNamed, show, unmount, viewPanel } from "../test-support.tsx";
import { AgentScreen } from "./agent-page.tsx";

afterEach(() => {
  unmount();
  vi.useRealTimers();
});

/** Sorter runs in Claude Code, which the host finds as `readiness` says. */
function hostWhere(readiness: () => HarnessReadiness): AgentsHost {
  const base = memoryAgentsHost({
    hubs: [{ id: "acme", name: "acme" }],
    agents: [{ hubId: "acme", id: "sorter", name: "Sorter", harness: "claude-code" }],
  });
  return {
    ...base,
    harnessReadiness: async (_agent, harness) =>
      harness === "claude-code" ? readiness() : { status: "missing" },
  };
}

const chat = (page: HTMLElement) => page.querySelector<HTMLElement>('section[aria-label="Chat"]');
const selectedTab = (page: HTMLElement, list: string) =>
  page.querySelector(`[role=tablist][aria-label="${list}"] [aria-selected="true"]`)?.textContent;
const notInstalled = "Sorter can't run until Claude Code is installed.";

verifies("agents.page.frame", () => {
  it("shows the Try it chat on the left, with the agent's Configuration in the panel beside it", async () => {
    const page = await show(
      <AgentScreen
        host={hostWhere(() => ({ status: "ready", version: "2.1.0" }))}
        hubId="acme"
        id="sorter"
      />,
    );

    const box = chat(page)?.querySelector("textarea");
    expect(box).not.toBeNull();
    expect(viewPanel(page).contains(box ?? null)).toBe(false);
    expect(
      (chat(page) as HTMLElement).compareDocumentPosition(viewPanel(page)) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(selectedTab(page, "Agent views")).toMatch(/^Configuration/);
  });

  it("opens Configuration › Harness from the chat's Open Harness settings ›, from any view", async () => {
    const page = await show(
      <AgentScreen host={hostWhere(() => ({ status: "missing" }))} hubId="acme" id="sorter" />,
    );
    await act(async () => buttonNamed(page, "Runs")?.click());
    expect(chat(page)?.textContent).toContain(notInstalled);

    await act(async () => buttonNamed(chat(page) as HTMLElement, "Open Harness settings")?.click());

    expect(selectedTab(page, "Agent views")).toMatch(/^Configuration/);
    expect(
      [...viewPanel(page).querySelectorAll('[role=tab][aria-selected="true"]')].map(
        (tab) => tab.textContent,
      ),
    ).toContain("Harness");
  });

  it("reopens a closed panel for Open Harness settings ›, with focus on the Harness page's tab", async () => {
    const page = await show(
      <AgentScreen host={hostWhere(() => ({ status: "missing" }))} hubId="acme" id="sorter" />,
    );
    await act(async () =>
      page.querySelector<HTMLElement>('button[aria-label="Close Configuration"]')?.click(),
    );
    expect(viewPanel(page).closest("[hidden]")).not.toBeNull();

    await act(async () => buttonNamed(chat(page) as HTMLElement, "Open Harness settings")?.click());

    expect(viewPanel(page).closest("[hidden]")).toBeNull();
    expect(document.activeElement?.getAttribute("role")).toBe("tab");
    expect(document.activeElement?.textContent).toBe("Harness");
  });

  it("drops the chat's line once Check again on the Harness page finds the harness", async () => {
    let readiness: HarnessReadiness = { status: "missing" };
    const page = await show(
      <AgentScreen host={hostWhere(() => readiness)} hubId="acme" id="sorter" />,
    );
    await act(async () => buttonNamed(chat(page) as HTMLElement, "Open Harness settings")?.click());
    expect(chat(page)?.textContent).toContain(notInstalled);

    readiness = { status: "ready", version: "2.1.0" };
    await act(async () => buttonNamed(viewPanel(page), "Check again")?.click());

    expect(chat(page)?.textContent).not.toContain(notInstalled);
  });
});

/** Sorter's host, whose reads of the agent and its settings fail while `failing.now` is true. */
function hostFailingWhile(failing: { now: boolean }): AgentsHost {
  const base = hostWhere(() => ({ status: "ready", version: "2.1.0" }));
  const unless = <Value,>(read: () => Promise<Value>) => {
    if (failing.now)
      return Promise.reject(new KindedError("unavailable", "The engine isn't answering."));
    return read();
  };
  return {
    ...base,
    read: (ref) => unless(() => base.read(ref)),
    settings: (ref) => unless(() => base.settings(ref)),
  };
}

const count = (page: HTMLElement, text: string) => page.textContent?.split(text).length ?? 1;

verifies("agents.chat.first-load", () => {
  it("shows one Couldn't load, in the panel, whose Try again reads both and focuses the name", async () => {
    const failing = { now: true };
    const page = await show(
      <AgentScreen host={hostFailingWhile(failing)} hubId="acme" id="sorter" />,
    );
    expect(count(page, "Couldn't load")).toBe(2);
    expect(viewPanel(page).textContent).toContain("Couldn't load this agent");
    expect(chat(page)?.textContent).toBe("");

    failing.now = false;
    await act(async () => buttonNamed(viewPanel(page), "Try again")?.click());
    expect(chat(page)?.querySelector("textarea")).not.toBeNull();
    expect(document.activeElement).toBe(page.querySelector("h1"));
  });

  it("shows that state in the chat while the panel doesn't show beside it", async () => {
    const page = await show(
      <AgentScreen host={hostFailingWhile({ now: true })} hubId="acme" id="sorter" />,
    );
    await act(async () =>
      page.querySelector<HTMLElement>('button[aria-label="Close Configuration"]')?.click(),
    );
    expect(chat(page)?.textContent).toContain("Couldn't load this agent");
    expect(buttonNamed(chat(page) as HTMLElement, "Try again")).toBeDefined();
  });

  it("names the agent as the host knows it while it is read, in one skeleton", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const base = hostWhere(() => ({ status: "ready", version: "2.1.0" }));
    const slow: AgentsHost = { ...base, read: () => new Promise(() => {}) };
    const page = await show(<AgentScreen host={slow} hubId="acme" id="sorter" />);
    await act(async () => vi.advanceTimersByTime(10_300));
    const nameField = page.querySelector<HTMLInputElement>('input[aria-label="Agent name"]');
    expect(nameField?.value).toBe("Sorter");
    expect(viewPanel(page).textContent).toContain("Loading Sorter");
    expect(count(page, "Still loading")).toBe(2);
  });
});
