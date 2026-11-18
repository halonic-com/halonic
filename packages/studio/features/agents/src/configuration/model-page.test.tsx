// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { memoryAgentsHost } from "../memory-host.ts";
import { AgentScreen } from "../page/agent-page.tsx";
import { buttonNamed, show, typeInto, unmount } from "../test-support.tsx";
import { SAVE_PAUSE_MS } from "./use-auto-saved.ts";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const ref = { hubId: "acme", id: "sorter" };

async function openModel(readAliases?: () => Promise<readonly string[]>) {
  const memory = memoryAgentsHost({
    hubs: [{ id: "acme", name: "acme" }],
    agents: [{ ...ref, name: "Sorter", model: "fast" }],
    modelAliases: ["fast", "smart"],
  });
  const agents = readAliases === undefined ? memory : { ...memory, modelAliases: readAliases };
  const page = await show(<AgentScreen host={agents} hubId="acme" id="sorter" />);
  await act(async () => buttonNamed(page, "Configuration")?.click());
  await act(async () =>
    [...page.querySelectorAll<HTMLElement>("[role=tab]")]
      .find((tab) => tab.textContent === "Model")
      ?.click(),
  );
  const select = page.querySelector("select") as HTMLSelectElement;
  const limit = page.querySelector("[role=tabpanel] input") as HTMLInputElement;
  return { page, agents, select, limit };
}

const blur = (input: HTMLElement) =>
  act(async () => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));

verifies("agents.configuration.model", () => {
  it("says it couldn't load the models when reading them fails, and loads them on Try again", async () => {
    let works = false;
    const { page } = await openModel(async () => {
      if (!works) throw new Error("The hub didn't answer.");
      return ["fast", "smart"];
    });
    expect(page.textContent).toContain("Couldn't load the models");
    expect(page.querySelector("select")).toBeNull();

    works = true;
    await act(async () => buttonNamed(page, "Try again")?.click());
    const select = page.querySelector("select") as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual(["fast", "smart"]);
  });

  it("lists the hub's aliases and shows the agent's model", async () => {
    const { select } = await openModel();
    expect([...select.options].map((option) => option.value)).toEqual(["fast", "smart"]);
    expect(select.value).toBe("fast");
  });

  it("saves the model as soon as one is picked", async () => {
    const { agents, select } = await openModel();
    await act(async () => {
      select.value = "smart";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect((await agents.settings(ref)).model).toBe("smart");
  });

  it("saves a turn limit after a pause, and 6 when it is emptied", async () => {
    const { agents, limit } = await openModel();
    await typeInto(limit, "25");
    await act(async () => vi.advanceTimersByTime(SAVE_PAUSE_MS));
    expect((await agents.settings(ref)).maxSteps).toBe(25);

    await typeInto(limit, "");
    await blur(limit);
    expect((await agents.settings(ref)).maxSteps).toBe(6);
  });

  it("doesn't save a turn limit outside 1 to 200, and says why", async () => {
    const { page, agents, limit } = await openModel();
    for (const bad of ["500", "0", "2.5", "many"]) {
      await typeInto(limit, bad);
      await blur(limit);
      expect(page.textContent, bad).toContain("Enter a whole number from 1 to 200.");
      expect((await agents.settings(ref)).maxSteps, bad).toBe(6);
    }
  });
});
