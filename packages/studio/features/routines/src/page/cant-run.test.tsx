// @vitest-environment jsdom
import type { SandboxStartResult } from "@halonicjs/app";
import { PresentationProvider } from "@halonicjs/studio-kit";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { RoutinesHost, RoutineView } from "../api.ts";
import { buttonNamed, show, unmount } from "../test-support.tsx";
import { daily, hostReading, runNowButton } from "./page.test-helper.tsx";
import { RoutineScreen } from "./routine-page.tsx";

afterEach(unmount);

/** Acme's *Daily summary*, whose workflow runs an agent in Claude Code unless told otherwise. */
const dailySummary: RoutineView = { ...daily, name: "Daily summary", startsProgram: true };

const refused: SandboxStartResult = { ok: false, reason: "bubblewrap-missing" };

async function open(
  options: {
    readonly routine?: RoutineView;
    readonly answers?: SandboxStartResult[];
    readonly phone?: boolean;
  } = {},
) {
  const answers = [...(options.answers ?? [refused])];
  const check = vi.fn(
    async () => (answers.length > 1 ? answers.shift() : answers[0]) as SandboxStartResult,
  );
  const runNow = vi.fn(async () => ({ started: true, runId: "run_1", shortId: "abc123" }) as const);
  const { host } = hostReading(() => options.routine ?? dailySummary);
  const announce = vi.fn();
  const page = await show(
    <PresentationProvider presentation={options.phone ? "phone" : "desktop"}>
      <RoutineScreen
        host={{ ...host, runNow } as RoutinesHost}
        hubId="acme"
        id="daily"
        announce={announce}
        sandboxStartCheck={{ check }}
      />
    </PresentationProvider>,
  );
  await act(async () => {});
  return { page, check, runNow, announce };
}

const firstLine = "Daily summary can't run: the sandbox can't start on this computer.";

verifies("routines.page.cant-run", () => {
  it("makes Run now unavailable but focusable, described by the Callout's first line", async () => {
    const { page, runNow } = await open();
    const button = runNowButton(page) as HTMLButtonElement;
    expect(button.getAttribute("aria-disabled")).toBe("true");
    expect(button.disabled).toBe(false);
    expect(
      document.getElementById(button.getAttribute("aria-describedby") ?? "")?.textContent,
    ).toBe(firstLine);
    await act(async () => button.click());
    expect(runNow).not.toHaveBeenCalled();
  });

  it("shows the Callout on the Schedule and Runs views, and the routine stays on", async () => {
    const { page } = await open();
    expect(page.textContent).toContain(firstLine);
    expect(page.textContent).not.toContain("Off ·");
    const runsTab = [...page.querySelectorAll("[role='tab']")].find((tab) =>
      tab.textContent?.startsWith("Runs"),
    ) as HTMLElement;
    await act(async () => runsTab.click());
    expect(page.textContent).toContain(firstLine);
  });

  it("offers no way to run without the sandbox (J)", async () => {
    const { page } = await open();
    expect(page.textContent).not.toMatch(/run anyway|skip the sandbox|continue without/i);
    const calloutControls = [
      ...page.querySelectorAll(".bg-warning-soft button, .bg-warning-soft a"),
    ];
    expect(calloutControls.map((control) => control.textContent?.trim())).toEqual([
      expect.stringContaining("Check again"),
      expect.stringContaining("Read the guide"),
    ]);
  });

  it("keeps Run now unavailable and focusable on a phone", async () => {
    const { page } = await open({ phone: true });
    expect(runNowButton(page)?.getAttribute("aria-disabled")).toBe("true");
  });

  it("gives Run now the focus once Check again finds the sandbox ready", async () => {
    const { page, announce } = await open({ answers: [refused, { ok: true }] });
    await act(async () => buttonNamed(page, "Check again")?.click());
    const button = runNowButton(page) as HTMLButtonElement;
    expect(button.hasAttribute("aria-disabled")).toBe(false);
    expect(document.activeElement).toBe(button);
    expect(page.textContent).not.toContain(firstLine);
    expect(announce).toHaveBeenCalledWith("The sandbox works now. You can run Daily summary.");
  });

  it("doesn't check a routine whose target starts no program", async () => {
    const { page, check } = await open({ routine: { ...dailySummary, startsProgram: false } });
    expect(check).not.toHaveBeenCalled();
    expect(page.textContent).not.toContain(firstLine);
    expect(runNowButton(page)?.hasAttribute("aria-disabled")).toBe(false);
  });
});
