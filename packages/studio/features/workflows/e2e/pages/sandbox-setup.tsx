import { SandboxSetupFlow, type SandboxSetupState } from "@halonicjs/studio-feature-settings/api";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

/** One state of each setup screen, as the engine reports them on a Windows PC and on Linux. */
const states: Record<string, SandboxSetupState> = {
  "setting-up": { kind: "setting-up", path: "wsl", stepsDone: 2, permissionNext: "windows" },
  offline: { kind: "setting-up", path: "wsl", stepsDone: 1, offline: true },
  "restart-needed": { kind: "restart-needed" },
  "cant-set-up": { kind: "cant-set-up", reason: "virtualisation-off" },
  "tool-missing": {
    kind: "tool-missing",
    tools: [
      { name: "bubblewrap", ready: false },
      { name: "ripgrep", ready: true },
    ],
    command: "sudo apt install bubblewrap",
    ubuntu2404: true,
  },
  testing: {
    kind: "testing",
    checks: [
      { label: "Can write inside your project", result: "passed" },
      { label: "Can't read outside your project", result: "passed" },
      { label: "Can't reach a blocked website", result: "pending" },
    ],
  },
  "test-failed": {
    kind: "test-failed",
    failedCheck: "Agents could still read files outside your project",
  },
  done: {
    kind: "done",
    name: "Sandbox for Windows",
    caveat: "Network limits are weaker on Windows.",
  },
  "done-none": { kind: "done-none", promise: true },
};

const asked = new URLSearchParams(location.search).get("state") ?? "setting-up";
const state = states[asked];
if (state === undefined) {
  throw new Error(`The sandbox setup page has no state "${asked}".`);
}

const root = document.getElementById("root");
if (root === null) {
  throw new Error("The sandbox setup page needs its #root element (sandbox-setup.html).");
}
const nothing = () => undefined;
createRoot(root).render(
  <StrictMode>
    <div className="flex h-screen bg-canvas text-fg">
      <SandboxSetupFlow
        state={state}
        step="Step 2 of 3"
        onCancel={nothing}
        onTryAgain={nothing}
        onChooseAnother={nothing}
        onContinueWithout={nothing}
        onRestartNow={nothing}
        onRestartLater={nothing}
        onCheckAgain={nothing}
        onOpenHalonic={nothing}
      />
    </div>
  </StrictMode>,
);
