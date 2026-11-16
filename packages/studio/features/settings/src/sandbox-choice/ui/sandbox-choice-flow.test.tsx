// @vitest-environment jsdom
import type { SandboxBackendId, SandboxBackendStatus } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { sandboxChoiceView } from "../sandbox-choice-view.ts";
import { SandboxChoiceFlow } from "./sandbox-choice-flow.tsx";

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

const windowsView = sandboxChoiceView(
  {
    active: null,
    setting: null,
    backends: [
      backend("srt-wsl"),
      backend("srt"),
      backend("docker-sbx", { state: "not-available", reason: "virtualisation-off" }),
      backend("cloud"),
    ],
  },
  "win32",
);

function press(root: HTMLElement, label: string) {
  const button = [...root.querySelectorAll("button")].find((one) =>
    one.textContent?.includes(label),
  );
  if (button === undefined) throw new Error(`no button ${label}`);
  act(() => button.click());
}

verifies("settings.sandbox-choice-flow", () => {
  const flow = (over: Partial<Parameters<typeof SandboxChoiceFlow>[0]> = {}) => (
    <SandboxChoiceFlow
      view={windowsView}
      platform="win32"
      onSetUp={() => {}}
      onContinueWithout={() => {}}
      {...over}
    />
  );

  it("shows the step, the recommended card and the three actions on a halo with no scrim", () => {
    const root = render(flow());
    const text = root.textContent ?? "";
    expect(text).toContain("Step 2 of 3");
    expect(text).toContain("Keep agents inside your project");
    expect(text).toContain("Sandbox in WSL");
    expect(text).toContain("Recommended");
    expect(root.querySelector("[data-testid=sandbox-halo]")?.getAttribute("aria-hidden")).toBe(
      "true",
    );
    expect(root.querySelector("[data-testid=sandbox-halo]")?.className).toContain(
      "pointer-events-none",
    );
    for (const label of ["Set up", "Other options", "More info", "Continue without sandbox"]) {
      expect(text).toContain(label);
    }
  });

  it("reports the recommended backend when Set up is pressed", () => {
    const onSetUp = vi.fn();
    const root = render(flow({ onSetUp }));
    press(root, "Set up");
    expect(onSetUp).toHaveBeenCalledWith("srt-wsl");
  });

  it("opens More info and Other options as second steps with a Back link", () => {
    const root = render(flow());
    press(root, "More info");
    expect(root.textContent).toContain("What is WSL?");
    press(root, "Back");
    expect(root.textContent).toContain("Keep agents inside your project");
    press(root, "Other options");
    expect(root.textContent).toContain("Choose a sandbox");
    expect(root.textContent).toContain("Sandbox for Windows");
    expect(root.textContent).toContain("Experimental");
    press(root, "Back");
    expect(root.textContent).toContain("Keep agents inside your project");
  });

  it("shows a backend that can't run with its reason and doesn't let it be set up", () => {
    const onSetUp = vi.fn();
    const root = render(flow({ onSetUp, initialScreen: "options" }));
    expect(root.textContent).toContain("Virtualisation is turned off on this computer.");
    const docker = root.querySelector<HTMLInputElement>('input[type="radio"][value="docker-sbx"]');
    act(() => docker?.click());
    press(root, "Set up Sandbox in WSL");
    expect(onSetUp).toHaveBeenCalledWith("srt-wsl");
  });

  it("keeps Cloud off until its warning is shown and its box ticked", () => {
    const onSetUp = vi.fn();
    const root = render(flow({ onSetUp, initialScreen: "options" }));
    act(() => root.querySelector<HTMLInputElement>('input[type="radio"][value="cloud"]')?.click());
    expect(root.textContent).toContain("Your project files are sent to a cloud service.");
    press(root, "Set up Cloud sandbox");
    expect(onSetUp).not.toHaveBeenCalled();
    act(() => root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click());
    press(root, "Set up Cloud sandbox");
    expect(onSetUp).toHaveBeenCalledWith("cloud");
  });

  it("asks before continuing without a sandbox and offers Set up a sandbox first", () => {
    const onContinueWithout = vi.fn();
    const root = render(flow({ onContinueWithout }));
    press(root, "Continue without sandbox");
    expect(root.textContent).toContain("Continue without a sandbox?");
    expect(root.textContent).toContain("your SSH keys");
    expect(onContinueWithout).not.toHaveBeenCalled();
    press(root, "Continue without sandbox");
    expect(onContinueWithout).toHaveBeenCalledOnce();
  });

  it("says it is checking, and says when it couldn't check, with Other options still there", () => {
    const checking = render(flow({ view: "checking" }));
    expect(checking.textContent).toContain("Checking your computer…");
    const failed = render(flow({ view: "failed" }));
    expect(failed.textContent).toContain("We couldn't check this computer. Pick an option below.");
    expect(failed.textContent).toContain("Continue without sandbox");
  });
});
