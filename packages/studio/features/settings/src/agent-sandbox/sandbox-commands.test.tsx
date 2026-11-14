// @vitest-environment jsdom
import { createToastStore, ToastStoreProvider } from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { type AgentSandboxHost, AgentSandboxService } from "../api.ts";
import { render, unmountAll } from "../test-support/render.tsx";
import { sandboxCommands } from "./sandbox-commands.ts";
import { createSandboxFlow, SandboxFlowService } from "./sandbox-flow.ts";
import { SandboxHost } from "./sandbox-host.tsx";
import type { SandboxCheckFacts, SandboxOutcome } from "./sandbox-state.ts";

afterEach(unmountAll);

function setup(
  over: { setUp?: SandboxOutcome | null; check?: SandboxCheckFacts; available?: boolean } = {},
) {
  const host = {
    available: over.available ?? true,
    check: vi.fn(async () => over.check ?? { state: "ready", checkedAt: "2026-11-09T09:12:00" }),
    running: vi.fn(async () => null),
    setUp: vi.fn(async () => over.setUp ?? null),
    remove: vi.fn(async () => null),
    follow: vi.fn(async () => null),
  } as AgentSandboxHost;
  const flow = createSandboxFlow();
  const services = new Map<string, unknown>([
    [AgentSandboxService.name, host],
    [SandboxFlowService.name, flow],
  ]);
  const openSettings = vi.fn();
  const context = {
    services: { find: (key: { name: string }) => services.get(key.name) },
    announcer: { announce: vi.fn() },
    openSettings,
  } as unknown as WorkspaceContext;
  const toasts = createToastStore();
  render(
    <ToastStoreProvider store={toasts}>
      <SandboxHost context={context} />
    </ToastStoreProvider>,
  );
  return { host, flow, context, toasts, openSettings };
}

verifies("settings.sandbox-commands", () => {
  it("lists Set up the agent sandbox only where a host can run it", () => {
    const { context } = setup();
    expect(sandboxCommands(context).map((command) => command.title)).toEqual([
      "Set up the agent sandbox",
    ]);
    expect(sandboxCommands(setup({ available: false }).context)).toEqual([]);
  });

  it("starts nothing until the command runs, then says it is set up", async () => {
    const { host, context, toasts } = setup();
    expect(host.setUp).not.toHaveBeenCalled();
    await act(async () => void sandboxCommands(context)[0]?.run(context));
    expect(toasts.list().map((toast) => toast.title)).toEqual(["The agent sandbox is set up"]);
  });

  it("says why it isn't set up, with Open Settings", async () => {
    const { context, toasts, openSettings } = setup({ setUp: { kind: "setup", how: "cancelled" } });
    await act(async () => void sandboxCommands(context)[0]?.run(context));
    const [toast] = toasts.list();
    expect(toast?.title).toBe(
      "The agent sandbox isn't set up: Windows didn't give Halonic administrator rights.",
    );
    toast?.action?.onClick();
    expect(openSettings).toHaveBeenCalledWith("agent-sandbox");
  });

  it("says when Windows must restart", async () => {
    const { context, toasts } = setup({ check: { state: "restart-needed" } });
    await act(async () => void sandboxCommands(context)[0]?.run(context));
    expect(toasts.list()[0]?.title).toContain("Windows needs to restart");
  });
});
