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
const chosenAt = "2026-11-17T09:00:00.000Z";
const settingFor = (saved: SandboxBackendId | "none" | null): SandboxChoice["setting"] => {
  if (saved === null) return null;
  if (saved === "none") return { backend: "none", chosenAt, appVersion: "1.0.0" };
  return { backend: saved, chosenAt };
};
const answered = (
  saved: SandboxBackendId | "none" | null,
  backends: SandboxBackendStatus[],
  over: Partial<Extract<SandboxStatusInput, { kind: "answered" }>> = {},
): SandboxStatusInput => ({
  kind: "answered",
  choice: {
    active: null,
    setting: settingFor(saved),
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
      name: "Sandbox: on. Opens sandbox settings.",
    });
    expect(view.row).toMatchObject({
      state: "Ready",
      line: "Sandbox in WSL · Last check passed today at 09:12",
      actions: ["change", "turn-off"],
    });
  });

  it("says No sandbox, with the asking promise only when the host keeps it", () => {
    const without = sandboxStatusView(answered("none", []));
    expect(without.badge).toMatchObject({
      label: "No sandbox",
      tone: "attention",
      name: "No sandbox. Opens sandbox settings.",
    });
    expect(without.row).toMatchObject({ state: "No sandbox", line: null });
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
    expect(view.badge).toMatchObject({
      label: "Sandbox: setup unfinished",
      tone: "attention",
      name: "Sandbox: setup unfinished. Opens sandbox settings.",
    });
    expect(view.row).toMatchObject({ state: "Restart needed", actions: ["restart", "change"] });
  });

  it("says why when the safety test failed", () => {
    const view = sandboxStatusView(
      answered("srt-wsl", [backend("srt-wsl", { state: "check-failed" })]),
    );
    expect(view.badge).toMatchObject({
      label: "Sandbox: check failed",
      tone: "danger",
      name: "Sandbox: check failed. Opens sandbox settings.",
    });
    expect(view.row.line).toBe(
      "The sandbox isn't ready: its safety test didn't pass, so it's off until Halonic starts again.",
    );
    expect(view.row.actions).toEqual(["check-again", "change"]);
  });

  it("keeps a red badge when a saved backend is no longer available, and keeps a name's capital", () => {
    const view = sandboxStatusView(
      answered("srt-wsl", [backend("srt-wsl", { state: "not-available", reason: "wsl-missing" })]),
    );
    expect(view.badge).toMatchObject({ label: "Sandbox: check failed", tone: "danger" });
    expect(view.row).toMatchObject({
      state: "Needs repair",
      line: "The sandbox isn't ready: WSL isn't installed yet.",
      actions: ["check-again", "change"],
    });
    const restart = sandboxStatusView(
      answered("srt-wsl", [
        backend("srt-wsl", { state: "not-available", reason: "restart-needed" }),
      ]),
    );
    expect(restart.row.line).toBe(
      "The sandbox isn't ready: Windows needs to restart to finish setup.",
    );
  });

  it("keeps the setup unfinished badge when a saved backend needs setting up again", () => {
    const view = sandboxStatusView(
      answered("srt-wsl", [
        backend("srt-wsl", { state: "setup-needed", reason: "distro-missing" }),
      ]),
    );
    expect(view.badge).toMatchObject({ label: "Sandbox: setup unfinished", tone: "attention" });
    expect(view.row).toMatchObject({ state: "Needs setting up", actions: ["set-up", "change"] });
  });

  it("is Checking, never red, when nothing is proven yet", () => {
    const view = sandboxStatusView(answered("srt-wsl", [backend("srt-wsl")]));
    expect(view.badge).toBeNull();
    expect(view.row).toMatchObject({
      state: "Checking",
      actions: ["check-again"],
      checkBusy: true,
    });
    const asking = sandboxStatusView({ kind: "checking" });
    expect(asking.badge).toBeNull();
    expect(asking.row).toMatchObject({
      state: "Checking",
      actions: ["check-again"],
      checkBusy: true,
    });
  });

  it("offers a busy Check again while the host is still asking, like a saved backend with no proof", () => {
    const asking = sandboxStatusView({ kind: "checking" }).row;
    const unproven = sandboxStatusView(answered("srt-wsl", [backend("srt-wsl")])).row;
    expect(asking).toEqual({
      state: "Checking",
      tone: "neutral",
      line: null,
      actions: ["check-again"],
      checkBusy: true,
    });
    expect(unproven).toEqual(asking);
  });

  it("says why a saved backend can't run, under a red badge", () => {
    const view = sandboxStatusView(
      answered("srt-wsl", [
        backend("srt-wsl", { state: "not-available", reason: "virtualisation-off" }),
      ]),
    );
    expect(view.badge).toMatchObject({ label: "Sandbox: check failed", tone: "danger" });
    expect(view.row).toMatchObject({
      state: "Needs repair",
      tone: "danger",
      line: "The sandbox isn't ready: virtualisation is turned off on this computer.",
      actions: ["check-again", "change"],
    });
  });

  it("reads a plain sentence when the backend gives no reason", () => {
    const view = sandboxStatusView(
      answered("docker-sbx", [backend("docker-sbx", { offered: false, state: "not-available" })]),
    );
    expect(view.row.line).toBe("The sandbox isn't ready.");
  });

  it("offers Set up a sandbox and Change when the saved backend still needs setting up", () => {
    const view = sandboxStatusView(
      answered("srt", [backend("srt", { state: "setup-needed", reason: "bubblewrap-missing" })], {
        platform: "linux",
      }),
    );
    expect(view.badge).toMatchObject({ label: "Sandbox: setup unfinished", tone: "attention" });
    expect(view.row).toMatchObject({
      state: "Needs setting up",
      line: null,
      actions: ["set-up", "change"],
    });
  });

  it("says it couldn't check when the host can't answer", () => {
    const view = sandboxStatusView({ kind: "unreachable", reason: "Halonic isn't running." });
    expect(view.badge).toBeNull();
    expect(view.row.line).toBe("Couldn't check the sandbox: Halonic isn't running.");
    expect(view.row.actions).toEqual(["check-again"]);
    const engine = sandboxStatusView({
      kind: "unreachable",
      reason: "The engine isn't answering.",
    });
    expect(engine.row.line).toBe("Couldn't check the sandbox: the engine isn't answering.");
  });
});
