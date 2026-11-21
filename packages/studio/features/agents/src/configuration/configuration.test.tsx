// @vitest-environment jsdom

import { PresentationProvider } from "@halonicjs/studio-kit";
import { SAVE_PAUSE_MS } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { memoryAgentsHost } from "../memory-host.ts";
import { AgentScreen } from "../page/agent-page.tsx";
import { buttonNamed, show, typeInto, typeIntoArea, unmount } from "../test-support.tsx";

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

async function openConfiguration(agents = host(), presentation: "desktop" | "phone" = "desktop") {
  const page = await show(
    <PresentationProvider presentation={presentation}>
      <AgentScreen host={agents} hubId="acme" id="sorter" />
    </PresentationProvider>,
  );
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

  it("moves to Model and selects it on ↓, with the list as one Tab stop", async () => {
    const { page } = await openConfiguration();
    const list = page.querySelector('[role=tablist][aria-orientation="vertical"]') as HTMLElement;
    const [behaviour, model] = [...list.querySelectorAll<HTMLElement>("[role=tab]")];
    expect([behaviour?.tabIndex, model?.tabIndex]).toEqual([0, -1]);

    await act(async () => behaviour?.focus());
    const down = new KeyboardEvent("keydown", {
      key: "ArrowDown",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => behaviour?.dispatchEvent(down));

    expect(model?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(model);
    expect([behaviour?.tabIndex, model?.tabIndex]).toEqual([-1, 0]);
    const panel = page.querySelector(`#${CSS.escape(model?.getAttribute("aria-controls") ?? "")}`);
    expect(panel?.getAttribute("aria-labelledby")).toBe(model?.id);
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
    const input = page.querySelector("[role=tabpanel] input") as HTMLInputElement;
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

verifies("agents.configuration.pages-phone", () => {
  it("puts the pages across the top on a phone, moved through with →", async () => {
    const { page } = await openConfiguration(host(), "phone");
    const list = page.querySelector(
      '[role=tablist][aria-label="Configuration pages"]',
    ) as HTMLElement;
    expect(list.getAttribute("aria-orientation")).toBe("horizontal");
    const [behaviour, model] = [...list.querySelectorAll<HTMLElement>("[role=tab]")];

    await act(async () => behaviour?.focus());
    const right = new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true,
      cancelable: true,
    });
    await act(async () => behaviour?.dispatchEvent(right));

    expect(model?.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(model);
    // The page sits below the list at the full width, not beside a fixed-width column.
    const configuration = list.parentElement?.parentElement;
    expect(configuration?.className).toContain("flex-col");
    expect(list.parentElement?.className).not.toContain("w-52");
    const panel = page.querySelector(`#${CSS.escape(model?.getAttribute("aria-controls") ?? "")}`);
    expect(panel?.parentElement).toBe(configuration);
    expect(panel?.textContent).toContain("Model");
  });

  it("keeps the column beside the page on the desktop", async () => {
    const { page } = await openConfiguration();
    const list = page.querySelector(
      '[role=tablist][aria-label="Configuration pages"]',
    ) as HTMLElement;
    expect(list.getAttribute("aria-orientation")).toBe("vertical");
    expect(list.parentElement?.parentElement?.className).not.toContain("flex-col");
  });
});

/** Stands in for the browser's ResizeObserver, which jsdom lacks: tells every observer the panel's width. */
function measurePanels() {
  const observers = new Set<(width: number) => void>();
  class FakeResizeObserver {
    readonly #tell: (width: number) => void;
    constructor(callback: ResizeObserverCallback) {
      this.#tell = (width) =>
        callback([{ contentRect: { width } } as ResizeObserverEntry], this as never);
    }
    observe() {
      observers.add(this.#tell);
    }
    disconnect() {
      observers.delete(this.#tell);
    }
    unobserve() {}
  }
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  return (width: number) =>
    act(async () => {
      for (const tell of observers) tell(width);
    });
}

verifies("agents.configuration.pages-narrow", () => {
  afterEach(() => vi.unstubAllGlobals());
  const pageList = (page: HTMLElement) =>
    page.querySelector('[role=tablist][aria-label="Configuration pages"]') as HTMLElement;

  it("keeps the column in a wide panel", async () => {
    const resize = measurePanels();
    const { page } = await openConfiguration();
    await resize(900);

    expect(pageList(page).getAttribute("aria-orientation")).toBe("vertical");
  });

  it("puts the list across the top in a narrow panel, and back with the same page", async () => {
    const resize = measurePanels();
    const { page } = await openConfiguration();
    await resize(400);

    const list = pageList(page);
    expect(list.getAttribute("aria-orientation")).toBe("horizontal");
    expect(list.parentElement?.className).not.toContain("w-52");
    expect(list.parentElement?.parentElement?.className).toContain("flex-col");
    // Behaviour, Model, …: the horizontal look repeats each label for its width, so pick by place.
    const model = list.querySelectorAll<HTMLElement>("[role=tab]")[1];
    await act(async () => model?.click());

    await resize(900);
    expect(pageList(page).getAttribute("aria-orientation")).toBe("vertical");
    expect(pageList(page).querySelector("[aria-selected=true]")?.textContent).toBe("Model");
  });
});

verifies("agents.configuration.section-pages", () => {
  /** The shell's `Sections`, as far as the page sees it: draws the section it's asked for. */
  function Sections({ only }: { readonly only?: string }) {
    return <p className="section">{`section ${only ?? "all"}`}</p>;
  }

  async function openWithTriggers() {
    const page = await show(
      <AgentScreen
        host={host()}
        hubId="acme"
        id="sorter"
        sections={[{ id: "triggers", title: "Triggers" }]}
        Sections={Sections}
      />,
    );
    await act(async () => buttonNamed(page, "Configuration")?.click());
    return page;
  }

  it("lists another feature's section as a page after the agent's own", async () => {
    const page = await openWithTriggers();
    const list = page.querySelector('[role=tablist][aria-label="Configuration pages"]');
    expect([...(list?.querySelectorAll("[role=tab]") ?? [])].map((tab) => tab.textContent)).toEqual(
      ["Behaviour", "Model", "Harness", "Tools", "Subagents", "Agent steps", "Triggers"],
    );
    expect(page.querySelector("p.section")).toBeNull();
  });

  it("draws only that section when its page is picked", async () => {
    const page = await openWithTriggers();
    await act(async () => buttonNamed(page, "Triggers")?.click());

    expect([...page.querySelectorAll("p.section")].map((one) => one.textContent)).toEqual([
      "section triggers",
    ]);
  });
});
