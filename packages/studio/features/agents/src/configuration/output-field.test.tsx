// @vitest-environment jsdom

import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AgentOutput } from "../api.ts";
import { memoryAgentsHost } from "../memory-host.ts";
import { AgentScreen } from "../page/agent-page.tsx";
import { buttonNamed, show, typeInto, typeIntoArea, unmount } from "../test-support.tsx";
import { SAVE_PAUSE_MS } from "./use-auto-saved.ts";

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  unmount();
  vi.useRealTimers();
});

const sorter = { hubId: "acme", id: "sorter" };

async function openBehaviour(output?: AgentOutput) {
  const agents = memoryAgentsHost({
    hubs: [{ id: "acme", name: "acme" }],
    agents: [{ ...sorter, name: "Sorter", ...(output === undefined ? {} : { output }) }],
  });
  const page = await show(<AgentScreen host={agents} hubId="acme" id="sorter" />);
  await act(async () => buttonNamed(page, "Configuration")?.click());
  const saved = async () => (await agents.settings(sorter)).output;
  return { page, saved };
}

/** The kit names a tab's element after its id, and draws its label twice (once for its width). */
const tabIds: Record<string, AgentOutput["type"]> = {
  Text: "text",
  "One of a list": "choice",
  JSON: "json",
};

const outputTab = (page: HTMLElement, name: string) =>
  page.querySelector<HTMLElement>(
    `[role=tablist][aria-label="Output"] [role=tab][id$="-tab-${tabIds[name]}"]`,
  );

const pick = async (page: HTMLElement, name: string) => {
  await act(async () => outputTab(page, name)?.click());
};

const button = (page: HTMLElement, name: string) =>
  page.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);

/** Opens the Add chip's box, types `option` and presses Enter or Esc. */
async function addOption(page: HTMLElement, option: string, key: "Enter" | "Escape" = "Enter") {
  await act(async () => button(page, "Add option")?.click());
  const box = page.querySelector<HTMLInputElement>('input[aria-label="New option"]');
  if (box === null) throw new Error("The Add chip opened no box.");
  await typeInto(box, option);
  await act(async () => {
    box.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

const schemaBox = (page: HTMLElement) =>
  [...page.querySelectorAll("textarea")].at(-1) as HTMLTextAreaElement;

verifies("agents.configuration.output", () => {
  it("shows the file's output, saves Text when it is picked, and starts on Text with none", async () => {
    const { page, saved } = await openBehaviour({ type: "choice", options: ["reply"] });
    expect(outputTab(page, "One of a list")?.getAttribute("aria-selected")).toBe("true");
    await pick(page, "Text");
    expect(await saved()).toEqual({ type: "text" });
    unmount();

    const fresh = await openBehaviour();
    expect(outputTab(fresh.page, "Text")?.getAttribute("aria-selected")).toBe("true");
  });

  it("saves each option added as a choice, and an option typed then Esc isn't added", async () => {
    const { page, saved } = await openBehaviour();
    await pick(page, "One of a list");
    expect(await saved()).toEqual({ type: "text" });
    expect(page.textContent).toContain("Add at least one option.");

    await addOption(page, "reply");
    await addOption(page, "archive");
    expect(await saved()).toEqual({ type: "choice", options: ["reply", "archive"] });
    expect(page.textContent).not.toContain("Add at least one option.");

    await addOption(page, "spam", "Escape");
    expect(await saved()).toEqual({ type: "choice", options: ["reply", "archive"] });
    expect(document.activeElement).toBe(button(page, "Add option"));
  });

  it("removes an option, moves focus on, and keeps the last option in the file", async () => {
    const { page, saved } = await openBehaviour({ type: "choice", options: ["reply", "archive"] });
    await act(async () => button(page, "Remove reply")?.click());
    expect(await saved()).toEqual({ type: "choice", options: ["archive"] });
    expect(document.activeElement).toBe(button(page, "Remove archive"));

    await act(async () => button(page, "Remove archive")?.click());
    expect(await saved()).toEqual({ type: "choice", options: ["archive"] });
    expect(page.textContent).toContain("Add at least one option.");
    expect(document.activeElement).toBe(button(page, "Add option"));
  });

  it("saves a schema after a pause, and none while it has a mistake", async () => {
    const { page, saved } = await openBehaviour();
    await pick(page, "JSON");
    expect(await saved()).toEqual({ type: "json" });
    expect(page.textContent).toContain("Schema (JSON)");
    expect(page.textContent).toContain("Each reply is checked against this schema.");

    await typeIntoArea(schemaBox(page), '{ "type": ');
    await act(async () => vi.advanceTimersByTime(SAVE_PAUSE_MS));
    expect(await saved()).toEqual({ type: "json" });
    expect(page.textContent).toContain("This isn't valid JSON.");

    await typeIntoArea(schemaBox(page), "[1, 2]");
    await act(async () => vi.advanceTimersByTime(SAVE_PAUSE_MS));
    expect(await saved()).toEqual({ type: "json" });
    expect(page.textContent).toContain("A schema is a JSON object, between { and }.");

    await typeIntoArea(schemaBox(page), '{ "type": "object" }');
    await act(async () => vi.advanceTimersByTime(SAVE_PAUSE_MS));
    expect(await saved()).toEqual({ type: "json", schema: { type: "object" } });
  });

  it("doesn't save the schema over Text when Text is picked during the pause", async () => {
    const { page, saved } = await openBehaviour({ type: "json" });
    await typeIntoArea(schemaBox(page), '{ "type": "object" }');
    await pick(page, "Text");
    await act(async () => vi.advanceTimersByTime(SAVE_PAUSE_MS));
    expect(await saved()).toEqual({ type: "text" });
  });
});
