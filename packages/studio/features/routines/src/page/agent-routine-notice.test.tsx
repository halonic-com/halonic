// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { RoutinesHost, RoutineView } from "../api.ts";
import { buttonNamed, show, unmount } from "../test-support.tsx";
import { daily, hostReading, runNowButton } from "./page.test-helper.tsx";
import { RoutineScreen } from "./routine-page.tsx";

afterEach(unmount);

const notice =
  "Halonic can't run an agent on its own yet, only as a step in a workflow. This routine won't start until it runs a workflow.";

/** *Daily*, which starts the agent *Analyst* rather than a workflow. */
const startsAnalyst: RoutineView = {
  ...daily,
  summary: "Weekdays at 07:30 → Analyst",
  targetName: "Analyst",
  target: { kind: "agent", hubId: "acme", id: "analyst", prompt: "Write the report." },
};

/** The page of `routine`, with a host that can start a run and lists Briefing and Analyst. */
async function open(routine: RoutineView) {
  const runNow = vi.fn(async () => ({ started: true, runId: "run_1", shortId: "abc123" }) as const);
  const { host } = hostReading(() => routine);
  const page = await show(
    <RoutineScreen
      host={
        {
          ...host,
          runNow,
          targets: async () => [
            { kind: "workflow", hubId: "acme", id: "briefing", name: "Briefing" },
            { kind: "agent", hubId: "acme", id: "analyst", name: "Analyst" },
          ],
        } as RoutinesHost
      }
      hubId="acme"
      id="daily"
      announce={() => {}}
    />,
  );
  await act(async () => {});
  return { page, runNow };
}

const runsOnItsOwn = (page: HTMLElement) =>
  page.querySelector<HTMLInputElement>("input[role=switch]") as HTMLInputElement;

/** The text of the element that describes `control`, as a screen reader hears it. */
const description = (control: Element | null | undefined) =>
  document.getElementById(control?.getAttribute("aria-describedby") ?? "")?.textContent;

/** The Starts card's picker, by its label "Workflow or agent". */
function startsPicker(page: HTMLElement): HTMLElement | null {
  const label = [...page.querySelectorAll("label")].find(
    (each) => each.textContent === "Workflow or agent",
  );
  return label === undefined ? null : document.getElementById(label.htmlFor);
}

verifies("routines.page.agent-routine-notice", () => {
  it("shows the notice for a routine that starts an agent, and makes Run now and Runs on its own unavailable", async () => {
    const { page, runNow } = await open(startsAnalyst);

    expect(page.textContent).toContain(notice);
    expect(buttonNamed(page, "Pick what it runs")).toBeDefined();
    const button = runNowButton(page);
    expect(button?.getAttribute("aria-disabled")).toBe("true");
    expect(description(button)).toBe(notice);
    expect(runsOnItsOwn(page).getAttribute("aria-label")).toBe("Runs on its own");
    expect(runsOnItsOwn(page).getAttribute("aria-disabled")).toBe("true");
    expect(description(runsOnItsOwn(page))).toBe(notice);

    await act(async () => button?.click());
    expect(runNow).not.toHaveBeenCalled();
  });

  it("shows the notice on the Runs view too, and Pick what it runs focuses the Starts picker on Schedule", async () => {
    const { page } = await open(startsAnalyst);
    const tab = (name: string) =>
      [...page.querySelectorAll<HTMLElement>("[role=tab]")].find((each) =>
        each.textContent?.startsWith(name),
      );
    await act(async () => tab("Runs")?.click());
    expect(page.textContent).toContain(notice);

    await act(async () => buttonNamed(page, "Pick what it runs")?.click());

    expect(tab("Schedule")?.getAttribute("aria-selected")).toBe("true");
    expect(startsPicker(page)).not.toBeNull();
    expect(document.activeElement).toBe(startsPicker(page));
  });

  it("shows no notice for a routine that starts a workflow, and leaves both available", async () => {
    const { page } = await open(daily);

    expect(page.textContent).not.toContain(notice);
    expect(buttonNamed(page, "Pick what it runs")).toBeUndefined();
    expect(runNowButton(page)?.hasAttribute("aria-disabled")).toBe(false);
    expect(runsOnItsOwn(page).hasAttribute("aria-disabled")).toBe(false);
  });
});
