// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentsHost } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { AgentScreen } from "../page/agent-page.tsx";
import { show, unmount } from "../test-support.tsx";
import { configurationErrors, errorTotal } from "./configuration-errors.ts";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const ref = { hubId: "acme", id: "sorter" };

const host = (agent: { model?: string; skills?: string[] } = {}) =>
  memoryAgentsHost({
    hubs: [{ id: "acme", name: "acme" }],
    agents: [{ ...ref, name: "Sorter", ...agent }],
    modelAliases: ["fast", "smart"],
    toolOptions: { skills: [{ id: "refunds", name: "Refund policy" }] },
  });

/** The tab whose label starts with `label`, in the item page's views or in Configuration's list. */
const tabNamed = (page: HTMLElement, label: string) =>
  [...page.querySelectorAll<HTMLElement>("[role=tab]")].find((tab) =>
    tab.textContent?.startsWith(label),
  );

async function openConfiguration(agents: AgentsHost) {
  const page = await show(<AgentScreen host={agents} hubId="acme" id="sorter" />);
  return page;
}

/** What a screen reader hears after the tab's name: ", 1 error", or "" with no counter. */
const counterOf = (tab: HTMLElement | undefined) =>
  tab?.querySelector(".sr-only")?.textContent ?? "";

const showConfiguration = (page: HTMLElement) =>
  act(async () => tabNamed(page, "Configuration")?.click());

verifies("agents.configuration.error-counts", () => {
  it("counts a model the hub has no alias for on Model and on the Configuration tab, before Configuration opens", async () => {
    const page = await openConfiguration(host({ model: "smrt" }));
    expect(counterOf(tabNamed(page, "Configuration"))).toBe(", 1 error");

    await showConfiguration(page);
    expect(counterOf(tabNamed(page, "Model"))).toBe(", 1 error");
    expect(counterOf(tabNamed(page, "Behaviour"))).toBe("");
  });

  it("counts each skill the hub can't use on Tools, and adds the pages up on the tab", async () => {
    const page = await openConfiguration(
      host({ model: "smrt", skills: ["refunds", "gone-skill"] }),
    );
    await showConfiguration(page);
    expect(counterOf(tabNamed(page, "Tools"))).toBe(", 1 error");
    expect(counterOf(tabNamed(page, "Configuration"))).toBe(", 2 errors");
  });

  it("takes the counters away once the model is fixed", async () => {
    const agents = host({ model: "smrt" });
    const page = await openConfiguration(agents);
    await showConfiguration(page);
    await act(async () => tabNamed(page, "Model")?.click());
    const select = page.querySelector("select") as HTMLSelectElement;
    await act(async () => {
      select.value = "smart";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(counterOf(tabNamed(page, "Model"))).toBe("");
    expect(counterOf(tabNamed(page, "Configuration"))).toBe("");
  });

  it("shows no counter when the file has no such errors", async () => {
    const page = await openConfiguration(host({ model: "fast", skills: ["refunds"] }));
    await showConfiguration(page);
    const counted = [...page.querySelectorAll("[role=tab]")].filter((tab) =>
      tab.textContent?.includes("error"),
    );
    expect(counted).toEqual([]);
  });

  it("counts nothing for a list it can't read", async () => {
    const settings = await host({ model: "smrt", skills: ["gone-skill"] }).settings(ref);
    const errors = configurationErrors(settings, undefined, undefined);
    expect(errors).toEqual({ model: 0, tools: 0 });
    expect(errorTotal(errors)).toBe(0);
  });
});
