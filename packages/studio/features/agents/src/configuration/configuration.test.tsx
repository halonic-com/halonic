// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { memoryAgentsHost } from "../memory-host.ts";
import { AgentScreen } from "../page/agent-page.tsx";
import { buttonNamed, show, typeInto, typeIntoArea, unmount } from "../test-support.tsx";
import { SAVE_PAUSE_MS } from "./use-auto-saved.ts";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const host = () =>
  memoryAgentsHost({
    hubs: [{ id: "acme", name: "acme" }],
    agents: [{ hubId: "acme", id: "sorter", name: "Sorter", instructions: "" }],
  });

async function openConfiguration(agents = host()) {
  const page = await show(<AgentScreen host={agents} hubId="acme" id="sorter" />);
  await act(async () => buttonNamed(page, "Configuration")?.click());
  return { page, agents };
}

const textarea = (page: HTMLElement) => page.querySelector("textarea") as HTMLTextAreaElement;

verifies("agents.configuration.behaviour", () => {
  it("lists Behaviour only, with no Save button, and hints while Instructions is empty", async () => {
    const { page } = await openConfiguration();
    expect([...page.querySelectorAll("[role=tab]")].map((tab) => tab.textContent)).toContain(
      "Behaviour",
    );
    expect(buttonNamed(page, "Save")).toBeUndefined();
    expect(page.textContent).toContain("What it should do and how, in plain words.");
  });

  it("saves Instructions after a pause in typing", async () => {
    const { page, agents } = await openConfiguration();
    await typeIntoArea(textarea(page), "Sort the mail.");
    expect((await agents.settings({ hubId: "acme", id: "sorter" })).instructions).toBe("");

    await act(async () => vi.advanceTimersByTime(SAVE_PAUSE_MS));
    expect((await agents.settings({ hubId: "acme", id: "sorter" })).instructions).toBe(
      "Sort the mail.",
    );
  });

  it("saves Description when the person leaves the field", async () => {
    const { page, agents } = await openConfiguration();
    const input = page.querySelector("input") as HTMLInputElement;
    await typeInto(input, "Sorts mail");
    await act(async () => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect((await agents.settings({ hubId: "acme", id: "sorter" })).description).toBe("Sorts mail");
  });

  it("doesn't save a key, and says why", async () => {
    const { page, agents } = await openConfiguration();
    await typeIntoArea(textarea(page), `use sk-${"a1B2".repeat(6)}`);
    await act(async () => vi.advanceTimersByTime(SAVE_PAUSE_MS));

    expect(page.textContent).toContain("This looks like a key. Keep it as a secret instead?");
    expect((await agents.settings({ hubId: "acme", id: "sorter" })).instructions).toBe("");
  });
});
