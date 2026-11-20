// @vitest-environment jsdom

import { FieldAnnounceProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentModelParams } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { AgentScreen } from "../page/agent-page.tsx";
import {
  buttonNamed,
  notSavedCounts,
  show,
  typeInto,
  typeIntoArea,
  unmount,
} from "../test-support.tsx";
import { SAVE_PAUSE_MS } from "./use-auto-saved.ts";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const sorter = { hubId: "acme", id: "sorter" };

async function openMoreSettings(
  params: AgentModelParams = {},
  saving?: ReturnType<typeof notSavedCounts>["saving"],
  announced?: string[],
) {
  const agents = memoryAgentsHost({
    hubs: [{ id: "acme", name: "acme" }],
    agents: [{ ...sorter, name: "Sorter", model: "fast", params }],
    modelAliases: ["fast"],
  });
  const page = await show(
    <FieldAnnounceProvider announce={(text) => announced?.push(text)}>
      <AgentScreen host={agents} saving={saving} hubId="acme" id="sorter" />
    </FieldAnnounceProvider>,
  );
  await act(async () => buttonNamed(page, "Configuration")?.click());
  await act(async () =>
    [...page.querySelectorAll<HTMLElement>("[role=tab]")]
      .find((tab) => tab.textContent === "Model")
      ?.click(),
  );
  const saved = async () => (await agents.settings(sorter)).params;
  return { page, saved };
}

/** The control a Field's label names. */
function control<Element extends HTMLElement>(page: HTMLElement, label: string): Element {
  const found = [...page.querySelectorAll("label")].find((one) => one.textContent === label);
  const element = found === undefined ? null : document.getElementById(found.htmlFor);
  if (element === null) throw new Error(`No field labelled ${label}.`);
  return element as Element;
}

const pause = () => act(async () => vi.advanceTimersByTime(SAVE_PAUSE_MS));

verifies("agents.configuration.more-settings", () => {
  it("is folded, and the row names the settings the file sets", async () => {
    const { page } = await openMoreSettings({ temperature: 0.2, stop: ["END"] });
    const details = page.querySelector("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(details.querySelector("summary")?.textContent).toContain("More settings");
    expect(details.querySelector("summary")?.textContent).toContain("Temperature, Stop");
    expect(control<HTMLInputElement>(page, "Temperature").value).toBe("0.2");
  });

  it("saves each number after a pause, and an empty box takes it out of the file", async () => {
    const { page, saved } = await openMoreSettings({ temperature: 0.2 });
    await typeInto(control(page, "Top-p"), "0.9");
    await typeInto(control(page, "Max tokens"), "800");
    await pause();
    expect(await saved()).toEqual({ temperature: 0.2, topP: 0.9, maxTokens: 800 });

    await typeInto(control(page, "Temperature"), "");
    await pause();
    expect(await saved()).toEqual({ topP: 0.9, maxTokens: 800 });
  });

  it("saves no number with a mistake and says what to enter", async () => {
    const { page, saved } = await openMoreSettings();
    await typeInto(control(page, "Temperature"), "3");
    await typeInto(control(page, "Top-p"), "1.5");
    await typeInto(control(page, "Max tokens"), "2.5");
    await pause();
    expect(await saved()).toEqual({});
    expect(page.textContent).toContain("Enter a number from 0 to 2.");
    expect(page.textContent).toContain("Enter a number from 0 to 1.");
    expect(page.textContent).toContain("Enter a whole number above 0.");
  });

  it("reads a number's mistake once when it shows after the pause, and not again on leaving", async () => {
    const announced: string[] = [];
    const { page } = await openMoreSettings({}, undefined, announced);
    const temperature = control<HTMLInputElement>(page, "Temperature");
    temperature.focus();
    await typeInto(temperature, "3");
    await pause();
    await act(async () => vi.advanceTimersToNextFrame());
    expect(announced).toEqual(["Temperature: Enter a number from 0 to 2."]);

    await act(async () => temperature.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    temperature.blur();
    await act(async () => vi.advanceTimersToNextFrame());
    expect(announced).toHaveLength(1);
  });

  it("lines its fields up with Model call limit's, in the text colour", async () => {
    const { page } = await openMoreSettings();
    const fields = (page.querySelector("details") as HTMLElement).querySelector(
      "summary + div > div",
    ) as HTMLElement;
    expect(fields.className).toContain("-mx-4");
    expect(fields.className).toContain("text-fg");
    expect(fields.className).not.toContain("px-4");
  });

  it("counts each number with a mistake as a field not saved, until it is fixed", async () => {
    const { counts, saving } = notSavedCounts();
    const { page } = await openMoreSettings({}, saving);
    await typeInto(control(page, "Temperature"), "3");
    await typeInto(control(page, "Max tokens"), "2.5");
    await pause();
    expect(counts.at(-1)).toBe(2);

    await typeInto(control(page, "Temperature"), "1");
    await typeInto(control(page, "Max tokens"), "800");
    expect(counts.at(-1)).toBe(0);
  });

  it("keeps a number as typed while it reads the same as the file", async () => {
    const { page, saved } = await openMoreSettings();
    await typeInto(control(page, "Temperature"), "0.50");
    await pause();
    expect(await saved()).toEqual({ temperature: 0.5 });
    expect(control<HTMLInputElement>(page, "Temperature").value).toBe("0.50");
  });

  it("saves one stop sequence per line, skipping empty lines", async () => {
    const { page, saved } = await openMoreSettings();
    await typeIntoArea(control(page, "Stop"), "END\n\nSTOP\n");
    await pause();
    expect(await saved()).toEqual({ stop: ["END", "STOP"] });
    expect(control<HTMLTextAreaElement>(page, "Stop").value).toBe("END\n\nSTOP\n");

    await typeIntoArea(control(page, "Stop"), "");
    await pause();
    expect(await saved()).toEqual({});
  });

  it("saves the reasoning effort when it is picked, and Model's default takes it out", async () => {
    const { page, saved } = await openMoreSettings();
    const effort = control<HTMLSelectElement>(page, "Reasoning effort");
    expect(effort.value).toBe("default");
    await act(async () => {
      effort.value = "high";
      effort.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(await saved()).toEqual({ reasoningEffort: "high" });

    await act(async () => {
      effort.value = "default";
      effort.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(await saved()).toEqual({});
  });
});
