// @vitest-environment jsdom
import { agentTint, FormatLocaleProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, unmountAll } from "../test-support/render.tsx";
import type { AppRun } from "./app-run.ts";
import { RunsAppList } from "./runs-app-list.tsx";

afterEach(unmountAll);

const now = new Date("2026-11-25T10:00:00Z");
const timeZone = "Europe/Madrid";

function run(id: string, overrides: Partial<AppRun> = {}): AppRun {
  return {
    id,
    phase: "succeeded",
    startedAt: "2026-11-25T08:00:00Z",
    lineage: id,
    cost: { kind: "none" },
    title: "Nightly report",
    line: "Done in 2 min",
    where: "Acme Ops",
    by: { kind: "workflow" },
    chip: { word: "Done", tone: "success" },
    label: `Run ${id}, Nightly report, done.`,
    ...overrides,
  };
}

const runs = [
  run("running", {
    phase: "running",
    startedAt: "2026-11-25T09:53:00Z",
    title: "Weekly digest",
    chip: { word: "Running", tone: "running" },
    cost: { kind: "money", currency: "EUR", minorUnits: 4 },
  }),
  run("failed", {
    phase: "failed",
    line: "Failed in the step Fetch sales",
    chip: { word: "Failed", tone: "danger" },
    cost: { kind: "money", currency: "EUR", minorUnits: 7 },
  }),
  run("agent", {
    title: "Reviewer",
    where: "Paperclip · Acme",
    by: { kind: "agent", name: "Reviewer" },
    cost: { kind: "tokens", tokens: 1200 },
  }),
];

/** Shows the list in the window's `locale` format, en-GB unless a test says otherwise. */
function show(overrides: Partial<Parameters<typeof RunsAppList>[0]> = {}, locale = "en-GB") {
  const props = {
    runs,
    opened: new Set<string>(),
    now,
    timeZone,
    selected: undefined,
    onOpen: vi.fn(),
    onCosts: vi.fn(),
    ...overrides,
  };
  const list = (
    <FormatLocaleProvider locale={locale}>
      <RunsAppList {...props} />
    </FormatLocaleProvider>
  );
  return { root: render(list), props };
}

const text = (element: Element | null | undefined) => element?.textContent?.trim() ?? "";

verifies("runs.app-list", () => {
  describe("RunsAppList", () => {
    it("heads the list with the running count and today's summary", () => {
      const { root } = show();
      expect(text(root.querySelector("h1"))).toBe("Runs1 running");
      expect(text(root.querySelector("header p"))).toBe("Today: 3 runs · 1 failed · €0.11Costs ›");
    });

    it("groups the rows under their headings, most urgent first", () => {
      const { root } = show();
      expect([...root.querySelectorAll("h2")].map(text)).toEqual([
        "Failed",
        "Running",
        "Earlier today",
      ]);
    });

    it("leads each row with what ran as a tile with its state's corner dot, not a chip", () => {
      const { root } = show();
      const leading = (id: string) =>
        root.querySelector(`[data-row-id="${id}"] [data-part="run-tile"]`);
      for (const id of ["running", "failed", "agent"]) {
        const tile = leading(id);
        expect(tile?.parentElement?.parentElement?.firstElementChild).toBe(tile?.parentElement);
      }
      expect(leading("failed")?.querySelector("[data-state]")?.getAttribute("data-state")).toBe(
        "failed",
      );
      expect(leading("agent")?.textContent).toBe("R");
      expect(leading("running")?.querySelector("svg[data-place-icon='workflows']")).not.toBeNull();
      // No chip word: the row reads what ran, the time, its line, where, and the cost.
      expect(text(root.querySelector('[data-row-id="failed"]'))).toBe(
        "Nightly report09:00Failed in the step Fetch salesAcme Ops€0.07",
      );
    });

    it("ends the title line with the time and the where line with the cost", () => {
      const { root } = show();
      const part = (id: string, name: string) =>
        text(root.querySelector(`[data-row-id="${id}"] [data-part="${name}"]`));
      expect(part("running", "title-end")).toBe("7 min");
      expect(part("failed", "title-end")).toBe("09:00");
      expect(part("running", "cost")).toBe("€0.04 so far");
      expect(part("failed", "cost")).toBe("€0.07");
      expect(part("agent", "cost")).toBe("1,200 tokens");
      expect(part("agent", "where-line")).toBe("Paperclip · Acme1,200 tokens");
      const money = root.querySelector('[data-row-id="running"] [data-part="cost"] .text-fg');
      expect(text(money)).toBe("€0.04");
    });

    it("colours the Needs you and Failed headings, and leaves the others", () => {
      const needsYou = run("waiting", { phase: "needs-you" });
      const { root } = show({ runs: [...runs, needsYou] });
      const tone = (heading: Element) =>
        ["text-warning", "text-danger", "text-fg-muted"].find((name) =>
          heading.className.includes(name),
        );
      const tones = [...root.querySelectorAll("h2")].map((heading) => [
        text(heading),
        tone(heading),
      ]);
      expect(tones).toEqual([
        ["Needs you", "text-warning"],
        ["Failed", "text-danger"],
        ["Running", "text-fg-muted"],
        ["Earlier today", "text-fg-muted"],
      ]);
    });

    it("says so when nothing ran today, and leaves Running out", () => {
      const { root } = show({ runs: [run("old", { startedAt: "2026-11-24T08:00:00Z" })] });
      expect(text(root.querySelector("header p"))).toBe("No runs yet today.Costs ›");
      expect(text(root.querySelector("h1"))).toBe("Runs");
      expect([...root.querySelectorAll("h2")].map(text)).toEqual(["Yesterday"]);
    });

    it("opens a run on a click and the Costs view from the summary line", () => {
      const { root, props } = show();
      const buttons = [...root.querySelectorAll("button")];
      act(() => buttons.find((button) => text(button) === "Costs ›")?.click());
      expect(props.onCosts).toHaveBeenCalledOnce();
      const row = root.querySelector<HTMLElement>('[data-row-id="failed"] td');
      act(() => row?.click());
      expect(props.onOpen).toHaveBeenCalledWith("failed");
    });
  });
});

verifies("runs.app-list-time", () => {
  it("writes a finished run's start time as the kit does, in the window's format and the user's zone", () => {
    const { root } = show({ runs: [run("done")] }, "en-US");
    // 08:00 UTC is 09:00 in Madrid.
    expect(root.textContent).toContain("9:00 AM");
  });

  it("says an earlier day's failure's day under Failed, where no heading says it", () => {
    const failed = run("failed", {
      phase: "failed",
      startedAt: "2026-11-24T08:00:00Z",
      chip: { word: "Failed", tone: "danger" },
    });
    const { root } = show({ runs: [failed] });
    expect(root.textContent).toContain("Nightly reportYesterday");
  });
});

verifies("runs.agent-tint", () => {
  it("draws an agent's tile in its own colour, and an unknown agent's neutral", () => {
    const known = run("known", {
      by: { kind: "agent", name: "Ada", id: "paperclip:acme:agent:ada" },
    });
    const unknown = run("unknown", { by: { kind: "agent", name: "An agent" } });
    const { root } = show({ runs: [known, unknown] });
    const tiles = [...root.querySelectorAll('[data-part="run-tile"]')];
    expect(tiles[0]?.firstElementChild?.className).toContain(agentTint("paperclip:acme:agent:ada"));
    expect(tiles[1]?.firstElementChild?.className).toContain("bg-surface-muted");
  });
});
