// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { memoryAgentsHost } from "../memory-host.ts";
import { AgentScreen } from "../page/agent-page.tsx";
import { buttonNamed, redraw, show, typeInto, unmount } from "../test-support.tsx";
import { SAVE_PAUSE_MS } from "./use-auto-saved.ts";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const ref = { hubId: "acme", id: "sorter" };

async function openModel(
  readAliases?: () => Promise<readonly string[]>,
  agent: { model?: string } = { model: "fast" },
  defaultModel?: string,
) {
  const memory = memoryAgentsHost({
    hubs: [{ id: "acme", name: "acme" }],
    agents: [{ ...ref, name: "Sorter", ...agent }],
    modelAliases: ["fast", "smart"],
    defaultModel,
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

  it("shows the workspace default in the picker while the file names no model", async () => {
    const { select } = await openModel(undefined, {}, "smart");
    expect(select.value).toBe("");
    expect(select.textContent).toContain("Workspace default (smart)");
    expect(select.textContent).not.toContain("Choose a model");
  });

  it("shows the workspace default without its name when the alias is called default", async () => {
    const { select } = await openModel(undefined, {}, "default");
    expect(select.textContent).toContain("Workspace default");
    expect(select.textContent).not.toContain("(default)");
  });

  it("asks to choose a model when the file names none and the workspace has no default", async () => {
    const { select } = await openModel(undefined, {});
    expect(select.textContent).toContain("Choose a model");
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

verifies("agents.configuration.open-at-model", () => {
  const agents = () =>
    memoryAgentsHost({
      hubs: [{ id: "acme", name: "acme" }],
      agents: [{ ...ref, name: "Sorter", model: "fast" }],
      modelAliases: ["fast", "smart"],
    });
  const screen = (host: ReturnType<typeof agents>, modelRequest?: string) => (
    <AgentScreen host={host} hubId="acme" id="sorter" modelRequest={modelRequest} />
  );
  // The picker takes the focus a moment after it is drawn, once the shell focused the heading.
  const settle = () => act(async () => vi.advanceTimersByTime(1));
  const pickTab = (page: HTMLElement, name: string) =>
    act(async () =>
      [...page.querySelectorAll<HTMLElement>("[role=tab]")]
        .find((tab) => tab.textContent === name)
        ?.click(),
    );
  /** The Configuration page shown, by its tab's id (`agent-config-model`); `undefined` on Runs. */
  const configurationPage = (page: HTMLElement) =>
    page.querySelector("#agent-config-panel")?.getAttribute("aria-labelledby") ?? undefined;

  it("opens on Configuration › Model with the picker focused", async () => {
    const page = await show(screen(agents(), "sorter/1"));
    await settle();
    expect(configurationPage(page)).toBe("agent-config-model");
    expect(document.activeElement).toBe(page.querySelector("select"));
  });

  it("opens there again when asked again, after the person moved away", async () => {
    const host = agents();
    const page = await show(screen(host, "sorter/1"));
    await settle();
    await act(async () => buttonNamed(page, "Runs")?.click());
    await redraw(screen(host, "sorter/2"));
    await settle();
    expect(configurationPage(page)).toBe("agent-config-model");
    expect(document.activeElement).toBe(page.querySelector("select"));
  });

  it("moves the focus once for each request, not when Model is picked by hand", async () => {
    const page = await show(screen(agents(), "sorter/1"));
    await settle();
    (document.activeElement as HTMLElement).blur();
    await pickTab(page, "Behaviour");
    await pickTab(page, "Model");
    await settle();
    expect(document.activeElement).not.toBe(page.querySelector("select"));
  });

  it("doesn't take the request up again when the person comes back to Configuration by hand", async () => {
    const page = await show(screen(agents(), "sorter/1"));
    await settle();
    await act(async () => buttonNamed(page, "Runs")?.click());
    (document.activeElement as HTMLElement).blur();
    await act(async () => buttonNamed(page, "Configuration")?.click());
    await settle();
    expect(configurationPage(page)).toBe("agent-config-behaviour");
    expect(document.activeElement).not.toBe(page.querySelector("select"));
  });

  it("opens on Runs without the step", async () => {
    const page = await show(screen(agents()));
    await settle();
    expect(configurationPage(page)).toBeUndefined();
    expect(page.textContent).toContain("Runs");
  });
});
