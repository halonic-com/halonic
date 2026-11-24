// @vitest-environment jsdom

import {
  createToastStore,
  type Presentation,
  PresentationProvider,
  ToastStoreProvider,
} from "@halonicjs/studio-kit";
import { createCloseStack } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { memoryAgentsHost } from "../memory-host.ts";
import { AgentScreen } from "../page/agent-page.tsx";
import { buttonNamed, show, unmount } from "../test-support.tsx";

/** The panel's size and the map's natural size, as a browser with a layout would measure them. */
const sizes = { panel: { width: 784, height: 600 }, map: { width: 896, height: 400 } };

/** The resize observers the page made, with the elements each watches. */
const observers: { readonly callback: () => void; readonly watched: Element[] }[] = [];

class FakeResizeObserver {
  private readonly entry: { readonly callback: () => void; readonly watched: Element[] };
  constructor(callback: () => void) {
    this.entry = { callback, watched: [] };
    observers.push(this.entry);
  }
  observe(element: Element) {
    this.entry.watched.push(element);
  }
  unobserve() {}
  disconnect() {
    this.entry.watched.length = 0;
  }
}

/** Measures the panel and the map by the sizes above, and every other element as 0. */
function measure(property: "clientWidth" | "clientHeight" | "offsetWidth" | "offsetHeight") {
  const side = property.endsWith("Width") ? "width" : "height";
  vi.spyOn(HTMLElement.prototype, property, "get").mockImplementation(function (this: HTMLElement) {
    if (property.startsWith("client") && this.hasAttribute("data-map-panel")) {
      return sizes.panel[side];
    }
    if (property.startsWith("offset") && this.parentElement?.hasAttribute("data-map-panel")) {
      return sizes.map[side];
    }
    return 0;
  });
}

beforeEach(() => {
  sizes.panel = { width: 784, height: 600 };
  observers.length = 0;
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  for (const property of ["clientWidth", "clientHeight", "offsetWidth", "offsetHeight"] as const) {
    measure(property);
  }
});
afterEach(() => {
  unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const host = () =>
  memoryAgentsHost({
    hubs: [{ id: "acme", name: "Acme Mail" }],
    agents: [
      {
        hubId: "acme",
        id: "triage",
        name: "Mail triage",
        agentSteps: [{ id: "classify", instructions: "Sort it." }],
        subagents: ["writer"],
        skills: ["tone"],
        connectors: ["acme-mail"],
      },
      { hubId: "acme", id: "writer", name: "Writer" },
      { hubId: "acme", id: "sorter", name: "Sorter", subagents: ["triage"] },
    ],
    toolOptions: {
      skills: [{ id: "tone", name: "Tone" }],
      connectors: [{ id: "acme-mail", name: "Acme mail" }],
    },
    users: {
      "acme/triage": [
        { hubId: "acme", id: "support-reply", name: "Support reply", stepIds: ["sort", "reply"] },
      ],
    },
  });

/** Opens Mail triage's page, which opens on Flow. */
const openMap = (presentation: Presentation = "desktop") =>
  show(
    <PresentationProvider presentation={presentation}>
      <ToastStoreProvider store={createToastStore()}>
        <AgentScreen host={host()} hubId="acme" id="triage" closeStack={createCloseStack()} />
      </ToastStoreProvider>
    </PresentationProvider>,
  );

/** Tells the page's resize observers that the panel changed size. */
const resized = () =>
  act(() => {
    for (const observer of observers) {
      if (observer.watched.some((element) => element.hasAttribute("data-map-panel"))) {
        observer.callback();
      }
    }
  });

const mapOf = (page: HTMLElement) =>
  page.querySelector<HTMLElement>("[aria-label='How Mail triage fits in']");

verifies("agents.map.lines-and-fit", () => {
  it("joins each side's cards to the centre card by a line with a port at each end", async () => {
    const page = await openMap();
    const lines = page.querySelector("[data-map-lines]");
    // Two cards on the left, two below and one on the right; add buttons and agent steps get none.
    expect(lines?.querySelectorAll("path")).toHaveLength(5);
    expect(lines?.querySelectorAll("[data-map-port]")).toHaveLength(10);
  });

  it("keeps the lines from screen readers and the pointer, so only the cards can be pressed", async () => {
    const page = await openMap();
    const lines = page.querySelector("[data-map-lines]");
    expect(lines?.getAttribute("aria-hidden")).toBe("true");
    expect(lines?.getAttribute("class")).toContain("pointer-events-none");
    expect(lines?.querySelector("a, button, [tabindex]")).toBeNull();
  });

  it("fits the map to the panel when it opens, with no zoom buttons", async () => {
    const page = await openMap();
    // 896 wide in a 784 wide panel: down to 0.875, centred in the panel's height.
    expect(mapOf(page)?.style.transform).toBe("translate(0px, 125px) scale(0.875)");
    for (const name of ["Zoom in", "Zoom out", "Fit"]) {
      expect(buttonNamed(page, name)).toBeUndefined();
    }
  });

  it("shrinks it no further than 0.8, centred on whole pixels, and the panel scrolls for the rest", async () => {
    // 400 high in a 300 high panel would need 0.75.
    sizes.panel = { width: 800, height: 300 };
    const page = await openMap();
    expect(mapOf(page)?.style.transform).toBe("translate(42px, 0px) scale(0.8)");
  });

  it("fits it again 260 ms after the panel stops changing size", async () => {
    const page = await openMap();
    vi.useFakeTimers();
    sizes.panel = { width: 1200, height: 600 };
    resized();
    act(() => vi.advanceTimersByTime(200));
    resized();
    act(() => vi.advanceTimersByTime(259));
    expect(mapOf(page)?.style.transform).toBe("translate(0px, 125px) scale(0.875)");
    act(() => vi.advanceTimersByTime(1));
    // Never larger than its natural size: centred at 896 in 1200.
    expect(mapOf(page)?.style.transform).toBe("translate(152px, 100px) scale(1)");
  });

  it("scrolls a card or button that takes the focus into view inside the panel", async () => {
    const page = await openMap();
    const scrolled = vi.fn();
    HTMLElement.prototype.scrollIntoView = scrolled;
    try {
      // React's onFocus listens to focusin; jsdom won't focus into the page's hidden tab panel.
      const add = buttonNamed(page, "+ Add a tool");
      act(() => add?.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
      expect(scrolled).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
      expect(scrolled.mock.contexts[0]).toBe(add);
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });

  it("never shrinks the map on a phone, so the panel scrolls instead", async () => {
    const page = await openMap("phone");
    // 896 wide in a 784 wide panel stays at its natural size.
    expect(mapOf(page)?.style.transform).toBe("translate(0px, 100px) scale(1)");
  });
});

verifies("agents.map.stacked", () => {
  it("stacks the sides in a panel narrower than 45 rem: left, centre, below, right, with no lines", async () => {
    sizes.panel = { width: 390, height: 700 };
    const page = await openMap();
    const map = mapOf(page);
    expect(map?.hasAttribute("data-map-stacked")).toBe(true);
    expect(map?.style.transform).toBe("");
    expect(page.querySelector("[data-map-lines]")).toBeNull();
    // The same groups, in the reading order, so Tab goes the same way.
    const groups = [...(map?.querySelectorAll("[role=group] > h2") ?? [])].map(
      (heading) => heading.textContent,
    );
    expect(groups).toEqual(["What brings it work", "What it can use", "Who it hands work to"]);
    const text = map?.textContent ?? "";
    expect(text.indexOf("Mail triage")).toBeLessThan(text.indexOf("What it can use"));
  });

  it("stacks it where even 0.8 of the map would run off the panel's right edge", async () => {
    // The chat open beside the map in a 1280 px window (C46 AG1): 0.8 of 896 is 717 px.
    sizes.panel = { width: 589, height: 700 };
    const page = await openMap();
    expect(mapOf(page)?.hasAttribute("data-map-stacked")).toBe(true);
    expect(mapOf(page)?.style.transform).toBe("");
  });

  it("fits it again when the panel grows past 45 rem, and stacks it when it shrinks", async () => {
    sizes.panel = { width: 390, height: 700 };
    const page = await openMap();
    vi.useFakeTimers();
    sizes.panel = { width: 728, height: 625 };
    resized();
    act(() => vi.advanceTimersByTime(260));
    expect(mapOf(page)?.hasAttribute("data-map-stacked")).toBe(false);
    expect(mapOf(page)?.style.transform).toBe("translate(0px, 150px) scale(0.8125)");
    expect(page.querySelectorAll("[data-map-lines] path")).toHaveLength(5);
    sizes.panel = { width: 700, height: 600 };
    resized();
    act(() => vi.advanceTimersByTime(260));
    expect(mapOf(page)?.hasAttribute("data-map-stacked")).toBe(true);
  });
});

verifies("agents.map.phone-columns", () => {
  it("lays the map out in three narrow columns on a 360 px phone, at its natural size and with its lines", async () => {
    sizes.panel = { width: 360, height: 700 };
    const page = await openMap("phone");
    const map = mapOf(page);
    expect(map?.hasAttribute("data-map-stacked")).toBe(false);
    expect(map?.className).toContain("w-[22.5rem]");
    expect(map?.firstElementChild?.nextElementSibling?.className).toContain(
      "grid-cols-[minmax(5.75rem,6.25rem)_6.75rem_minmax(5.75rem,6.25rem)]",
    );
    expect(map?.style.transform).toContain("scale(1)");
    expect(page.querySelectorAll("[data-map-lines] path")).toHaveLength(5);
  });

  it("makes every card, add button and agent step a 48 px target on a phone", async () => {
    sizes.panel = { width: 360, height: 700 };
    const page = await openMap("phone");
    for (const name of ["Agent Writer", "+ Add subagent", "classify ›"]) {
      expect(buttonNamed(page, name)?.className).toContain("phone:min-h-touch");
    }
  });

  it("stacks the map on a phone narrower than 22.5 rem: under 360 px, or at larger text", async () => {
    sizes.panel = { width: 352, height: 700 };
    const narrow = await openMap("phone");
    expect(mapOf(narrow)?.hasAttribute("data-map-stacked")).toBe(true);
    unmount();
    sizes.panel = { width: 360, height: 700 };
    document.documentElement.style.fontSize = "18px";
    try {
      const larger = await openMap("phone");
      expect(mapOf(larger)?.hasAttribute("data-map-stacked")).toBe(true);
    } finally {
      document.documentElement.style.fontSize = "";
    }
  });
});
