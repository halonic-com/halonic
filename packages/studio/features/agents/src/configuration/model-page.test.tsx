// @vitest-environment jsdom

import { FieldAnnounceProvider } from "@halonicjs/studio-kit";
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

/** A window's save state that keeps each count of fields not saved it hears. */
function fieldCounts() {
  const counts: number[] = [];
  return {
    counts,
    saving: {
      setFieldsNotSaved: (item: { key: string; title: string }, count: number) => {
        expect(item).toEqual({ key: "agent/acme/sorter", title: "Sorter" });
        counts.push(count);
      },
    },
  };
}

async function openModel(
  readAliases?: () => Promise<readonly string[]>,
  agent: { model?: string } = { model: "fast" },
  defaultModel?: string,
  screen: {
    saving?: ReturnType<typeof fieldCounts>["saving"];
    failSaves?: boolean;
    announced?: string[];
  } = {},
) {
  const memory = memoryAgentsHost({
    hubs: [{ id: "acme", name: "acme" }],
    agents: [{ ...ref, name: "Sorter", ...agent }],
    modelAliases: ["fast", "smart"],
    defaultModel,
  });
  const read = readAliases === undefined ? memory : { ...memory, modelAliases: readAliases };
  const agents =
    screen.failSaves === true
      ? {
          ...read,
          update: async () => {
            throw new Error("The disk is full.");
          },
        }
      : read;
  const page = await show(
    <FieldAnnounceProvider announce={(text) => screen.announced?.push(text)}>
      <AgentScreen host={agents} saving={screen.saving} hubId="acme" id="sorter" />
    </FieldAnnounceProvider>,
  );
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

  it("says when the file names an alias the hub doesn't have, until one is picked", async () => {
    const unknown = "smrt isn't a model alias in this workspace. Choose one, or add it in Models.";
    const { page, select } = await openModel(undefined, { model: "smrt" });
    expect(select.value).toBe("smrt");
    expect(page.textContent).toContain(unknown);
    expect(select.getAttribute("aria-invalid")).toBe("true");

    await act(async () => {
      select.value = "smart";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(page.textContent).not.toContain(unknown);
  });

  it("takes a provider/model name as it is, with no error", async () => {
    const { page, select } = await openModel(undefined, { model: "ollama/llama3.2" });
    expect(select.value).toBe("ollama/llama3.2");
    expect(page.textContent).not.toContain("isn't a model alias");
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

  it("says the model call limit counts per step and harness agents don't use it", async () => {
    const { page } = await openModel();
    expect(page.textContent).toContain(
      "The most model calls in one step. Empty means 6. Claude Code and Codex agents don't use it.",
    );
    expect(page.textContent).not.toContain("in one run");
  });

  it("sizes the model call limit's box for a small number, not the whole column", async () => {
    const { limit } = await openModel();
    // The kit's short Input (`kit.input-short`): the text is 6 characters wide and the box fits it.
    expect(limit.className.split(" ")).toContain("w-input-short");
    expect((limit.parentElement as HTMLElement).className.split(" ")).not.toContain("w-full");
  });

  it("shows a turn limit's mistake after the pause or when the field is left, not on every key", async () => {
    const { page, limit } = await openModel();
    await typeInto(limit, "2.");
    expect(page.textContent).not.toContain("Enter a whole number from 1 to 200.");
    await act(async () => vi.advanceTimersByTime(SAVE_PAUSE_MS));
    expect(page.textContent).toContain("Enter a whole number from 1 to 200.");

    await typeInto(limit, "25");
    expect(page.textContent).not.toContain("Enter a whole number from 1 to 200.");
    await typeInto(limit, "x");
    expect(page.textContent).not.toContain("Enter a whole number from 1 to 200.");
    await blur(limit);
    expect(page.textContent).toContain("Enter a whole number from 1 to 200.");
  });

  it("reads a turn limit's mistake once when it shows after the pause, and not again on leaving", async () => {
    const announced: string[] = [];
    const { limit } = await openModel(undefined, undefined, undefined, { announced });
    limit.focus();
    await typeInto(limit, "500");
    await act(async () => vi.advanceTimersByTime(SAVE_PAUSE_MS));
    await act(async () => vi.advanceTimersToNextFrame());
    expect(announced).toEqual(["Model call limit: Enter a whole number from 1 to 200."]);

    await blur(limit);
    limit.blur();
    await act(async () => vi.advanceTimersToNextFrame());
    expect(announced).toHaveLength(1);
  });

  it("counts a turn limit with a mistake as a field not saved, until it is fixed", async () => {
    const { counts, saving } = fieldCounts();
    const { limit } = await openModel(undefined, undefined, undefined, { saving });
    await typeInto(limit, "500");
    await blur(limit);
    expect(counts.at(-1)).toBe(1);

    await typeInto(limit, "50");
    expect(counts.at(-1)).toBe(0);
  });

  it("counts a turn limit whose save failed as a field not saved, and 0 when the page goes", async () => {
    const { counts, saving } = fieldCounts();
    const { page, limit } = await openModel(undefined, undefined, undefined, {
      saving,
      failSaves: true,
    });
    await typeInto(limit, "25");
    await blur(limit);
    expect(page.textContent).toContain("Couldn't save: The disk is full.");
    expect(counts.at(-1)).toBe(1);

    await act(async () =>
      [...page.querySelectorAll<HTMLElement>("[role=tab]")]
        .find((tab) => tab.textContent === "Behaviour")
        ?.click(),
    );
    expect(counts.at(-1)).toBe(0);
  });

  it("stops counting a turn limit whose save failed once it says what the file holds again", async () => {
    const { counts, saving } = fieldCounts();
    const { limit } = await openModel(undefined, undefined, undefined, {
      saving,
      failSaves: true,
    });
    await typeInto(limit, "25");
    await blur(limit);
    expect(counts.at(-1)).toBe(1);

    await typeInto(limit, "6");
    await blur(limit);
    expect(counts.at(-1)).toBe(0);
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
