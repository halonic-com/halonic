// @vitest-environment jsdom
import type { SandboxBackendId, SandboxBackendStatus, SandboxChoice } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { sandboxStatusView } from "../sandbox-status-view.ts";
import { SandboxBadgeButton, SandboxStatusRowView } from "./sandbox-status.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; container: HTMLElement }[] = [];

afterEach(() => {
  for (const { root, container } of mounted.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
});

function render(element: ReactNode): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  act(() => root.render(element));
  return container;
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((one) =>
    one.textContent?.includes(label),
  );
  if (found === undefined) throw new Error(`no button ${label}`);
  return found;
}

const backend = (
  id: SandboxBackendId,
  over: Partial<SandboxBackendStatus> = {},
): SandboxBackendStatus => ({
  id,
  offered: true,
  state: "available",
  reason: null,
  setup: null,
  missing: [],
  limits: [],
  residuals: [],
  ...over,
});
const chosenAt = "2026-11-17T09:00:00.000Z";
const statusOf = (setting: SandboxChoice["setting"], backends: SandboxBackendStatus[]) =>
  sandboxStatusView({
    kind: "answered",
    choice: { active: null, setting, backends },
    platform: "win32",
    lastCheck: null,
    agentsAsk: false,
  });

verifies("settings.sandbox-status-ui", () => {
  it("offers Set up a sandbox as the primary step when there is no sandbox", () => {
    const onAction = vi.fn();
    const view = statusOf({ backend: "none", chosenAt, appVersion: "1.0.0" }, []);
    const root = render(<SandboxStatusRowView row={view.row} onAction={onAction} />);
    expect(root.textContent).toContain("No sandbox");
    const setUp = button(root, "Set up a sandbox");
    act(() => setUp.click());
    expect(onAction).toHaveBeenCalledWith("set-up");
    expect(root.querySelectorAll("button")).toHaveLength(1);
  });

  it("shows Change and Turn off for a sandbox in use and reports each press", () => {
    const onAction = vi.fn();
    const view = statusOf({ backend: "srt-wsl", chosenAt }, [
      backend("srt-wsl", { state: "in-use" }),
    ]);
    const root = render(<SandboxStatusRowView row={view.row} onAction={onAction} />);
    expect(root.textContent).toContain("Ready");
    act(() => button(root, "Change").click());
    act(() => button(root, "Turn off").click());
    expect(onAction.mock.calls).toEqual([["change"], ["turn-off"]]);
  });

  it("keeps the state and its sentence in a polite live region", () => {
    const view = statusOf({ backend: "srt-wsl", chosenAt }, [
      backend("srt-wsl", { state: "setup-needed", reason: "restart-needed" }),
    ]);
    const root = render(<SandboxStatusRowView row={view.row} onAction={() => undefined} />);
    const live = root.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain("Restart needed");
    expect(live?.textContent).toContain(
      "Windows needs to restart to finish setting up the sandbox.",
    );
    expect(button(root, "Restart now")).toBeDefined();
  });

  it("shows a busy Check again while the host is still asking, and no badge", () => {
    const view = sandboxStatusView({ kind: "checking" });
    const root = render(
      <>
        <SandboxBadgeButton badge={view.badge} onOpen={() => undefined} />
        <SandboxStatusRowView row={view.row} onAction={() => undefined} />
      </>,
    );
    expect(root.textContent).toContain("Checking");
    expect(root.querySelectorAll("button")).toHaveLength(1);
    expect(button(root, "Check again").getAttribute("aria-busy")).toBe("true");
  });

  it("names the badge for screen readers and opens Settings when pressed", () => {
    const onOpen = vi.fn();
    const view = statusOf({ backend: "srt-wsl", chosenAt }, [
      backend("srt-wsl", { state: "in-use" }),
    ]);
    const root = render(<SandboxBadgeButton badge={view.badge} onOpen={onOpen} />);
    const badge = button(root, "Sandbox: on");
    expect(badge.querySelector(".sr-only")?.textContent).toBe(
      "Sandbox status: ready. Opens sandbox settings.",
    );
    // The icon is hidden too, so look for the short words among every hidden part.
    const hidden = [...badge.querySelectorAll('[aria-hidden="true"]')].map(
      (one) => one.textContent,
    );
    expect(hidden).toContain("Sandbox: on");
    expect(badge.querySelector("svg")).not.toBeNull();
    act(() => badge.click());
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
