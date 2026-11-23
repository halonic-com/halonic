// @vitest-environment jsdom
import type { SandboxStartResult } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { RoutineRunAgentsProps, RoutinesHost, RoutineView } from "../api.ts";
import { buttonNamed, show, unmount } from "../test-support.tsx";
import { daily, hostReading, runNowButton } from "./page.test-helper.tsx";
import { RoutineScreen } from "./routine-page.tsx";

afterEach(unmount);

/** Acme's *Daily summary*, whose workflow runs *Writer* in Claude Code. */
const dailySummary: RoutineView = {
  ...daily,
  name: "Daily summary",
  startsProgram: true,
  programAgents: [{ id: "writer", name: "Writer" }],
};

const confirmLine = (name: string) => `${name} runs in the sandbox until you confirm again.`;
const cantRunLine = "Daily summary can't run: the sandbox can't start on this computer.";

/**
 * Stands in for the Agents feature's view: it says every agent is on hold, with a button that
 * opens the agent at Where it runs, as `ConfirmAgainCallouts` does (tested there).
 */
function OnHoldEveryone({ agents, openAgent }: RoutineRunAgentsProps) {
  return (
    <>
      {agents.map((agent) => (
        <p key={agent.id}>
          {confirmLine(agent.name)}
          <button type="button" onClick={() => openAgent?.(agent.id, "where-it-runs")}>
            Review and confirm
          </button>
        </p>
      ))}
    </>
  );
}

const onHoldView = { view: "OnHoldEveryone", load: async () => ({ OnHoldEveryone }) };

async function open(
  options: {
    readonly routine?: RoutineView;
    readonly check?: SandboxStartResult;
    readonly withView?: boolean;
    readonly openAgent?: (agentId: string, step?: string) => void;
  } = {},
) {
  const { host } = hostReading(() => options.routine ?? dailySummary);
  const runNow = vi.fn(async () => ({ started: true, runId: "run_1", shortId: "abc123" }) as const);
  const page = await show(
    <RoutineScreen
      host={{ ...host, runNow } as RoutinesHost}
      hubId="acme"
      id="daily"
      announce={() => {}}
      sandboxStartCheck={{ check: async () => options.check ?? { ok: true } }}
      {...(options.withView !== false && { runAgentsView: onHoldView })}
      {...(options.openAgent && { openAgent: options.openAgent })}
    />,
  );
  await act(async () => {});
  return page;
}

verifies("routines.page.confirm-again", () => {
  it("shows the Agents feature's view for the agents Run now starts, and Run now stays available", async () => {
    const page = await open();
    expect(page.textContent).toContain(confirmLine("Writer"));
    expect(runNowButton(page)?.hasAttribute("aria-disabled")).toBe(false);
  });

  it("comes after the can't-run Callout when the sandbox can't start too", async () => {
    const page = await open({ check: { ok: false, reason: "bubblewrap-missing" } });
    const text = page.textContent ?? "";
    expect(text.indexOf(cantRunLine)).toBeGreaterThanOrEqual(0);
    expect(text.indexOf(confirmLine("Writer"))).toBeGreaterThan(text.indexOf(cantRunLine));
  });

  it("shows it on the Runs view too", async () => {
    const page = await open();
    const runsTab = [...page.querySelectorAll("[role='tab']")].find((tab) =>
      tab.textContent?.startsWith("Runs"),
    ) as HTMLElement;
    await act(async () => runsTab.click());
    expect(page.textContent).toContain(confirmLine("Writer"));
  });

  it("opens the agent at Where it runs from Review and confirm", async () => {
    const openAgent = vi.fn();
    const page = await open({ openAgent });
    await act(async () => buttonNamed(page, "Review and confirm")?.click());
    expect(openAgent).toHaveBeenCalledWith("writer", "where-it-runs");
  });

  it("shows nothing for a routine that runs no agent in a program of its own", async () => {
    const page = await open({
      routine: { ...dailySummary, startsProgram: false, programAgents: [] },
    });
    expect(page.textContent).not.toContain("confirm again");
  });

  it("shows nothing in a window without the Agents feature", async () => {
    const page = await open({ withView: false });
    expect(page.textContent).not.toContain("confirm again");
  });
});
