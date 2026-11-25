// @vitest-environment jsdom
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
    chip: { word: "Done", tone: "success" },
    label: `Run ${id}, Nightly report, done.`,
    ...overrides,
  };
}

const runs = [
  run("running", {
    phase: "running",
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
    cost: { kind: "tokens", tokens: 1200 },
  }),
];

function show(overrides: Partial<Parameters<typeof RunsAppList>[0]> = {}) {
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
  return { root: render(<RunsAppList {...props} />), props };
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

    it("ends each row with its cost, so far while running, or tokens", () => {
      const { root } = show();
      const content = text(root);
      expect(content).toContain("€0.04 so far");
      expect(content).toContain("€0.07");
      expect(content).toContain("1,200 tokens");
      expect(content).toContain("Done in 2 min · Paperclip · Acme");
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
