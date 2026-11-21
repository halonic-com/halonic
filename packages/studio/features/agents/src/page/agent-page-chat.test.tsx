// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it } from "vitest";
import type { AgentsHost, HarnessReadiness } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { buttonNamed, show, unmount, viewPanel } from "../test-support.tsx";
import { AgentScreen } from "./agent-page.tsx";

afterEach(unmount);

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
