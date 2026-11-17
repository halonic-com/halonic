// @vitest-environment jsdom

import { KindedError } from "@halonicjs/std";
import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentListing, AgentsHost } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { buttonNamed, show, unmount } from "../test-support.tsx";
import { AgentScreen } from "./agent-page.tsx";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const sorter: AgentListing = { hubId: "acme", id: "sorter", name: "Sorter" };
const hostWith = () => memoryAgentsHost({ hubs: [{ id: "acme", name: "acme" }], agents: [sorter] });

verifies("agents.page.frame", () => {
  it("shows AGENT, the name and the empty Runs line at once", async () => {
    const page = await show(<AgentScreen host={hostWith()} hubId="acme" id="sorter" />);

    expect(page.textContent).toContain("AGENT");
    expect(page.querySelector("h1")?.textContent).toBe("Sorter");
    expect(page.textContent).toContain("No runs with this agent yet.");
    expect(page.querySelector("[role=status]")).toBeNull();
  });

  it("doesn't repeat the name on a phone, where the top bar has it", async () => {
    const page = await show(
      <PresentationProvider presentation="phone">
        <AgentScreen host={hostWith()} hubId="acme" id="sorter" />
      </PresentationProvider>,
    );
    expect(page.textContent).toContain("AGENT");
    expect(page.querySelector("h1")?.className).toContain("sr-only");
  });

  it("shows a skeleton only after 300 ms, and Still loading with Try again after 10 s", async () => {
    const slow: AgentsHost = { ...hostWith(), read: () => new Promise<AgentListing>(() => {}) };
    const page = await show(<AgentScreen host={slow} hubId="acme" id="sorter" />);
    expect(page.querySelector("[role=status]")).toBeNull();

    await act(async () => vi.advanceTimersByTime(300));
    expect(page.querySelector("[role=status]")?.textContent).toContain("Loading sorter");
    expect(page.textContent).not.toContain("Still loading");

    await act(async () => vi.advanceTimersByTime(10_000));
    expect(page.textContent).toContain("Still loading");
    expect(buttonNamed(page, "Try again")).toBeDefined();
  });

  it("says why it couldn't read the agent, and Try again reads it and focuses the name", async () => {
    let fail = true;
    const base = hostWith();
    const host: AgentsHost = {
      ...base,
      read: async (ref) => {
        if (fail) throw new KindedError("unavailable", "The engine isn't answering.");
        return base.read(ref);
      },
    };
    const page = await show(<AgentScreen host={host} hubId="acme" id="sorter" />);
    expect(page.textContent).toContain("Couldn't load this agent");
    expect(page.textContent).toContain("The engine isn't answering.");

    fail = false;
    await act(async () => buttonNamed(page, "Try again")?.click());
    expect(page.querySelector("h1")?.textContent).toBe("Sorter");
    expect(document.activeElement).toBe(page.querySelector("h1"));
  });

  it("shows the item-gone state, with the way to the Agents list, for an agent that isn't there", async () => {
    const goToAgents = vi.fn();
    const page = await show(
      <AgentScreen host={hostWith()} hubId="acme" id="ghost" goToAgents={goToAgents} />,
    );
    expect(page.textContent).toContain("Agents");
    await act(async () => buttonNamed(page, "Go to Agents")?.click());
    expect(goToAgents).toHaveBeenCalled();
  });

  it("shows the new name when the agent is renamed, without a skeleton", async () => {
    const files = new Map([["acme/sorter", sorter]]);
    const listeners = new Set<() => void>();
    const host: AgentsHost = {
      ...hostWith(),
      read: async (ref) => files.get(`${ref.hubId}/${ref.id}`) as AgentListing,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
    const page = await show(<AgentScreen host={host} hubId="acme" id="sorter" />);

    files.set("acme/sorter", { ...sorter, name: "Mail sorter" });
    await act(async () => {
      for (const listener of listeners) listener();
    });
    expect(page.querySelector("h1")?.textContent).toBe("Mail sorter");
    expect(page.querySelector("[role=status]")).toBeNull();
  });
});
