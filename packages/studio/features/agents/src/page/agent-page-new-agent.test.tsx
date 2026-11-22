// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentListing } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { buttonNamed, show, unmount, viewPanel } from "../test-support.tsx";
import { AgentScreen } from "./agent-page.tsx";
import { markFreshAgent } from "./fresh-agents.ts";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const sorter: AgentListing = { hubId: "acme", id: "sorter", name: "Sorter" };
const hostWith = () => memoryAgentsHost({ hubs: [{ id: "acme", name: "acme" }], agents: [sorter] });

verifies("agents.page.new-agent", () => {
  const instructionsBox = (page: HTMLElement) => viewPanel(page).querySelector("textarea");

  it("focuses Instructions on Behaviour for a just-made agent, and opens it on Flow later", async () => {
    markFreshAgent("acme", "sorter");
    const first = await show(<AgentScreen host={hostWith()} hubId="acme" id="sorter" />);

    const box = instructionsBox(first);
    expect(box).not.toBeNull();
    expect(document.activeElement).toBe(box);
    unmount();

    const later = await show(<AgentScreen host={hostWith()} hubId="acme" id="sorter" />);
    expect(buttonNamed(later, "Flow")?.getAttribute("aria-selected")).toBe("true");
    expect(instructionsBox(later)).toBeNull();
  });

  it("opens other agents on Flow without taking the focus", async () => {
    markFreshAgent("acme", "someone-else");
    const page = await show(<AgentScreen host={hostWith()} hubId="acme" id="sorter" />);

    expect(buttonNamed(page, "Flow")?.getAttribute("aria-selected")).toBe("true");
    expect(instructionsBox(page)).toBeNull();
  });

  it("doesn't take the focus again when the person leaves Behaviour and comes back", async () => {
    markFreshAgent("acme", "sorter");
    const page = await show(<AgentScreen host={hostWith()} hubId="acme" id="sorter" />);
    const tab = (name: string) =>
      [...page.querySelectorAll<HTMLElement>("[role=tab]")].find(
        (each) => each.textContent === name,
      );
    await act(async () => tab("Model")?.click());
    await act(async () => tab("Behaviour")?.click());

    expect(instructionsBox(page)).not.toBeNull();
    expect(document.activeElement).not.toBe(instructionsBox(page));
  });
});
