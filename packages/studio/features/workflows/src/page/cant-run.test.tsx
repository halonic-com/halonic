// @vitest-environment jsdom
import type { SandboxStartResult } from "@halonicjs/app";
import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { WorkflowStep, WorkflowView } from "../api.ts";
import { buttonNamed, memoryHost, memoryRuns, show, unmount } from "../test-support.tsx";
import { WorkflowScreen } from "./workflow-page.tsx";

afterEach(unmount);

const writer = { agent: "writer", agentName: "Writer", harness: "claude-code" } as const;

/** Acme's *Support reply*, whose `draft` runs `writer` in Claude Code unless `steps` says otherwise. */
function reply(steps?: readonly WorkflowStep[]): WorkflowView {
  return {
    hubId: "acme",
    id: "reply",
    name: "Support reply",
    initial: "read",
    steps: steps ?? [
      { id: "read", type: "task", agent: "sorter" },
      { id: "draft", type: "task", agent: "writer", program: writer },
      { id: "done", type: "final" },
    ],
    arrows: [],
    layout: {},
  };
}

const bubblewrapMissing: SandboxStartResult = { ok: false, reason: "bubblewrap-missing" };

async function open(
  options: {
    readonly workflow?: WorkflowView;
    readonly answers?: SandboxStartResult[];
    readonly phone?: boolean;
    readonly openAgent?: (id: string) => void;
    readonly announce?: (line: string) => void;
  } = {},
) {
  const answers = [...(options.answers ?? [bubblewrapMissing])];
  const check = vi.fn(
    async () => (answers.length > 1 ? answers.shift() : answers[0]) as SandboxStartResult,
  );
  const { host } = memoryHost([], [], [options.workflow ?? reply()], [], {
    startRun: async () => ({ runId: "run_mfx3k2a1_01jd8q" }),
  });
  const page = await show(
    <PresentationProvider presentation={options.phone ? "phone" : "desktop"}>
      <WorkflowScreen
        host={host}
        runs={memoryRuns().source}
        hubId="acme"
        id="reply"
        sandboxStartCheck={{ check }}
        {...(options.openAgent && { openAgent: options.openAgent })}
        {...(options.announce && { announce: options.announce })}
      />
    </PresentationProvider>,
  );
  await act(async () => {});
  return { page, check };
}

const firstLine = "Support reply can't run: the sandbox can't start on this computer.";

/** The page's Run button: named exactly "Run", unlike the Runs tab. */
const runOf = (page: HTMLElement) =>
  [...page.querySelectorAll("button")].find((button) => button.textContent?.trim() === "Run");

verifies("workflows.page.cant-run", () => {
  it("makes Run unavailable but focusable, described by the Callout's first line", async () => {
    const { page } = await open();
    const run = runOf(page) as HTMLButtonElement;
    expect(run.getAttribute("aria-disabled")).toBe("true");
    expect(run.disabled).toBe(false);
    expect(document.getElementById(run.getAttribute("aria-describedby") ?? "")?.textContent).toBe(
      firstLine,
    );
    act(() => run.click());
    expect(page.textContent).not.toContain("START A RUN");
  });

  it("ends with the step, its program and the agent's settings, which open the agent", async () => {
    const openAgent = vi.fn();
    const { page } = await open({ openAgent });
    expect(page.textContent).toContain(
      "The step Draft uses Claude Code. To run Writer without the sandbox, change it in Writer's settings ›",
    );
    act(() => buttonNamed(page, "Writer's settings")?.click());
    expect(openAgent).toHaveBeenCalledWith("writer");
  });

  it("counts the other steps that use a program", async () => {
    const { page } = await open({
      workflow: reply([
        { id: "draft", type: "task", agent: "writer", program: writer },
        { id: "check", type: "parallel", program: { ...writer, harness: "codex" } },
        { id: "send", type: "task", agent: "writer", program: writer },
      ]),
    });
    expect(page.textContent).toContain("The step Draft and 2 other steps use a program.");
  });

  it("shows the same Callout on the Flow, Configuration and Runs tabs", async () => {
    const { page } = await open();
    for (const tab of ["Configuration", "Runs", "Flow"]) {
      const button = [...page.querySelectorAll("[role='tab']")].find((one) =>
        one.textContent?.startsWith(tab),
      ) as HTMLElement;
      await act(async () => button.click());
      expect(page.textContent).toContain(firstLine);
    }
  });

  it("draws no Run on a phone, and says to use the computer with no link", async () => {
    const { page } = await open({ phone: true, openAgent: vi.fn() });
    expect(runOf(page)).toBeUndefined();
    expect(page.textContent).toContain("To change where Writer runs, use your computer.");
    expect(buttonNamed(page, "Writer's settings")).toBeUndefined();
  });

  it("offers no way to run without the sandbox anywhere on the page (J)", async () => {
    const { page } = await open({ openAgent: vi.fn() });
    expect(page.textContent).not.toMatch(/run anyway|skip the sandbox|continue without/i);
    const calloutControls = [
      ...page.querySelectorAll(".bg-warning-soft button, .bg-warning-soft a"),
    ];
    expect(calloutControls.map((control) => control.textContent?.trim())).toEqual([
      expect.stringContaining("Check again"),
      expect.stringContaining("Read the guide"),
      "Writer's settings ›",
    ]);
  });

  it("moves focus to Run, now enabled, once Check again finds the sandbox ready", async () => {
    const announce = vi.fn();
    const { page } = await open({ answers: [bubblewrapMissing, { ok: true }], announce });
    await act(async () => buttonNamed(page, "Check again")?.click());
    const run = runOf(page) as HTMLButtonElement;
    expect(run.hasAttribute("aria-disabled")).toBe(false);
    expect(document.activeElement).toBe(run);
    expect(page.textContent).not.toContain(firstLine);
    expect(announce).toHaveBeenCalledWith("The sandbox works now. You can run Support reply.");
  });

  it("doesn't check a workflow none of whose steps starts a program", async () => {
    const { page, check } = await open({
      workflow: reply([{ id: "read", type: "task", agent: "sorter" }]),
    });
    expect(check).not.toHaveBeenCalled();
    expect(page.textContent).not.toContain(firstLine);
    expect(runOf(page)?.hasAttribute("aria-disabled")).toBe(false);
  });
});
