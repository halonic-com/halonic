import type { SandboxBackendId, SandboxBackendStatus, SandboxChoice } from "@halonicjs/app";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type SandboxStatusInput, sandboxStatusView } from "./sandbox-status-view.ts";

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
const answered = (
  saved: SandboxBackendId | "none" | null,
  backends: SandboxBackendStatus[],
  over: Partial<Extract<SandboxStatusInput, { kind: "answered" }>> = {},
): SandboxStatusInput => ({
  kind: "answered",
  choice: {
    active: null,
    setting: saved === null ? null : { backend: saved, chosenAt: "2026-11-17T09:00:00.000Z" },
    backends,
  } satisfies SandboxChoice,
  platform: "win32",
  lastCheck: null,
  agentsAsk: false,
  ...over,
});

verifies("settings.sandbox-status-view", () => {
  it("shows no badge before anything is chosen", () => {
    const view = sandboxStatusView(answered(null, [backend("srt-wsl")]));
    expect(view.badge).toBeNull();
    expect(view.row.actions).toEqual(["set-up"]);
  });

  it("reads Sandbox: on with the name and last check for a backend in use", () => {
    const view = sandboxStatusView(
      answered("srt-wsl", [backend("srt-wsl", { state: "in-use" })], {
        lastCheck: "today at 09:12",
      }),
    );
    expect(view.badge).toMatchObject({
      label: "Sandbox: on",
      tone: "success",
      name: "Sandbox status: ready. Opens sandbox settings.",
    });
    expect(view.row).toMatchObject({
      state: "Ready",
      line: "Sandbox in WSL · Last check passed today at 09:12",
      actions: ["change", "turn-off"],
    });
  });

  it("says No sandbox, with the asking promise only when the host keeps it", () => {
    const without = sandboxStatusView(answered("none", []));
    expect(without.badge).toMatchObject({ label: "No sandbox", tone: "attention" });
    expect(without.row.line).toBe("No sandbox.");
    const asking = sandboxStatusView(answered("none", [], { agentsAsk: true }));
    expect(asking.row.line).toBe(
      "No sandbox. Agents ask before running commands or touching files outside the project.",
    );
    expect(asking.row.actions).toEqual(["set-up"]);
  });

  it("reads setup unfinished while Windows waits for the restart", () => {
    const view = sandboxStatusView(
      answered("srt-wsl", [
        backend("srt-wsl", { state: "setup-needed", reason: "restart-needed" }),
      ]),
    );
    expect(view.badge?.label).toBe("Sandbox: setup unfinished");
    expect(view.row).toMatchObject({ state: "Restart needed", actions: ["restart", "change"] });
  });

  it("says why when the safety test failed", () => {
    const view = sandboxStatusView(
      answered("srt-wsl", [backend("srt-wsl", { state: "check-failed" })]),
    );
    expect(view.badge).toMatchObject({ label: "Sandbox: check failed", tone: "danger" });
    expect(view.row.line).toBe(
      "The sandbox isn't ready: its safety test didn't pass, so it's off until Halonic starts again.",
    );
    expect(view.row.actions).toEqual(["check-again", "change"]);
  });

  it("is Checking, never red, when nothing is proven yet", () => {
    const view = sandboxStatusView(answered("srt-wsl", [backend("srt-wsl")]));
    expect(view.badge).toBeNull();
    expect(view.row).toMatchObject({ state: "Checking", checkBusy: true });
    expect(sandboxStatusView({ kind: "checking" }).badge).toBeNull();
  });

  it("says it couldn't check when the host can't answer", () => {
    const view = sandboxStatusView({ kind: "unreachable", reason: "Halonic isn't running." });
    expect(view.badge).toBeNull();
    expect(view.row.line).toBe("Couldn't check the sandbox: Halonic isn't running.");
    expect(view.row.actions).toEqual(["check-again"]);
  });
});
