// @vitest-environment jsdom
import { verifies } from "@halonicjs/testing-spec";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import {
  SandboxSetupFlow,
  type SandboxSetupFlowProps,
  type SandboxSetupState,
} from "./sandbox-setup-flow.tsx";

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

function press(root: HTMLElement, label: string) {
  const button = [...root.querySelectorAll("button")].find((one) =>
    one.textContent?.includes(label),
  );
  if (button === undefined) throw new Error(`no button ${label}`);
  act(() => button.click());
}

const handlers = () => ({
  onCancel: vi.fn(),
  onTryAgain: vi.fn(),
  onChooseAnother: vi.fn(),
  onContinueWithout: vi.fn(),
  onRestartNow: vi.fn(),
  onRestartLater: vi.fn(),
  onCheckAgain: vi.fn(),
  onOpenHalonic: vi.fn(),
});

const show = (state: SandboxSetupState, over: Partial<SandboxSetupFlowProps> = {}) => {
  const calls = handlers();
  const root = render(<SandboxSetupFlow state={state} {...calls} {...over} />);
  return { root, calls, text: root.textContent ?? "" };
};

verifies("settings.sandbox-setup-flow", () => {
  it("marks the steps of the WSL path Done, Working… and Waiting, with the permission line", () => {
    const { root, text } = show({
      kind: "setting-up",
      path: "wsl",
      stepsDone: 2,
      permissionNext: "windows",
    });
    expect(text).toContain("Setting up your sandbox");
    const rows = [...root.querySelectorAll("li")].map((li) => li.textContent);
    expect(rows).toEqual([
      "✓Check your computerDone",
      "✓Download WSLDone",
      "Install WSLWorking…",
      "○Set up the sandboxWaiting",
      "○FinishWaiting",
    ]);
    expect(text).toContain("Windows will ask for permission next. This is expected.");
  });

  it("has three steps on the native path and the password line on macOS and Linux", () => {
    const { root, text } = show({
      kind: "setting-up",
      path: "native",
      stepsDone: 0,
      permissionNext: "password",
    });
    expect(root.querySelectorAll("li")).toHaveLength(3);
    expect(text).toContain("Your computer will ask for your password next.");
  });

  it("reports Cancel, and offers Try again and Other options when offline", () => {
    const { root, calls, text } = show({
      kind: "setting-up",
      path: "wsl",
      stepsDone: 1,
      offline: true,
    });
    expect(text).toContain("We couldn't download what we need. Check your connection.");
    press(root, "Try again");
    press(root, "Other options");
    press(root, "Cancel");
    expect(calls.onTryAgain).toHaveBeenCalledOnce();
    expect(calls.onChooseAnother).toHaveBeenCalledOnce();
    expect(calls.onCancel).toHaveBeenCalledOnce();
  });

  it("asks to restart and reports which button was pressed", () => {
    const { root, calls, text } = show({ kind: "restart-needed" });
    expect(text).toContain("Restart to finish");
    press(root, "Restart later");
    press(root, "Restart now");
    expect(calls.onRestartLater).toHaveBeenCalledOnce();
    expect(calls.onRestartNow).toHaveBeenCalledOnce();
  });

  it("says why it can't set up, in words, with a way out", () => {
    const { root, calls, text } = show({ kind: "cant-set-up", reason: "virtualisation-off" });
    expect(text).toContain("We couldn't set this up");
    expect(text).toContain("Virtualisation is turned off on this computer.");
    expect(text).not.toContain("virtualisation-off");
    expect(root.textContent).not.toContain("Try again");
    press(root, "Choose another option");
    press(root, "Continue without sandbox");
    expect(calls.onChooseAnother).toHaveBeenCalledOnce();
    expect(calls.onContinueWithout).toHaveBeenCalledOnce();
  });

  it("shows the command and each tool's state when one is missing", () => {
    const { root, calls, text } = show({
      kind: "tool-missing",
      tools: [
        { name: "bubblewrap", ready: false },
        { name: "ripgrep", ready: true },
      ],
      command: "sudo apt install bubblewrap",
      ubuntu2404: true,
    });
    expect(text).toContain("bubblewrap is needed for the sandbox.");
    expect(text).toContain("sudo apt install bubblewrap");
    expect(text).toContain("bubblewrap: missing");
    expect(text).toContain("ripgrep: ready");
    expect(text).toContain("Halonic doesn't run it for you");
    press(root, "Check again");
    expect(calls.onCheckAgain).toHaveBeenCalledOnce();
  });

  it("lists exactly the checks it is given, with a result a screen reader reads", () => {
    const { root } = show({
      kind: "testing",
      checks: [
        { label: "Can write inside your project", result: "passed" },
        { label: "Can't read outside your project", result: "failed" },
        { label: "Can't reach a blocked website", result: "pending" },
      ],
    });
    const rows = [...root.querySelectorAll("li")].map((li) => li.textContent);
    expect(rows).toEqual([
      "✓passed: Can write inside your project",
      "✕didn't pass: Can't read outside your project",
      "○waiting: Can't reach a blocked website",
    ]);
  });

  it("names the failed check and offers three ways on", () => {
    const { root, calls, text } = show({
      kind: "test-failed",
      failedCheck: "Agents could still read files outside your project",
    });
    expect(text).toContain(
      "Agents could still read files outside your project, so the sandbox isn't protecting you yet.",
    );
    press(root, "Try again");
    press(root, "Choose another option");
    press(root, "Continue without sandbox");
    expect(calls.onTryAgain).toHaveBeenCalledOnce();
    expect(calls.onChooseAnother).toHaveBeenCalledOnce();
    expect(calls.onContinueWithout).toHaveBeenCalledOnce();
  });

  it("says the sandbox is on, with a caveat only when one is given", () => {
    const plain = show({ kind: "done", name: "Sandbox in WSL" });
    expect(plain.text).toContain("Sandbox in WSL is active. Agents work inside your project.");
    expect(plain.text).not.toContain("Good to know");
    const caveat = show({
      kind: "done",
      name: "Sandbox for Windows",
      caveat: "Network limits are weaker on Windows.",
    });
    expect(caveat.text).toContain("Good to know: network limits are weaker on Windows.");
    press(caveat.root, "Open Halonic");
    expect(caveat.calls.onOpenHalonic).toHaveBeenCalledOnce();
  });

  it("says that agents ask first only when told that they do", () => {
    expect(show({ kind: "done-none", promise: false }).text).not.toContain("will ask");
    const { text } = show({ kind: "done-none", promise: true });
    expect(text).toContain("You're all set");
    expect(text).toContain("Agents will ask before running commands");
  });

  it("shows the step label only when given one", () => {
    expect(show({ kind: "restart-needed" }).text).not.toContain("Step");
    expect(show({ kind: "restart-needed" }, { step: "Step 2 of 3" }).text).toContain("Step 2 of 3");
  });
});
