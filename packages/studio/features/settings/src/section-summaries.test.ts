import { HostSettings } from "@halonicjs/app";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { type AgentSandboxHost, AgentSandboxService, HostSettingsService } from "./api.ts";
import { agentSandboxSummary, assistantSummary } from "./section-summaries.ts";
import { MemoryHostSettingsStore } from "./test-support/memory-host-settings-store.ts";

async function contextWith(
  saved: Record<string, unknown>,
  sandbox?: Partial<AgentSandboxHost>,
): Promise<WorkspaceContext> {
  const store = new MemoryHostSettingsStore();
  for (const [key, value] of Object.entries(saved)) {
    await store.set(key, value as never);
  }
  const settings = new HostSettings(store);
  await settings.load();
  const services = {
    get: (key: unknown) => (key === HostSettingsService ? settings : undefined),
    find: (key: unknown) => (key === AgentSandboxService ? sandbox : undefined),
  };
  return { services } as unknown as WorkspaceContext;
}

verifies("settings.section-summaries", () => {
  it("says Not set up for the Assistant while no provider is set", async () => {
    expect(assistantSummary(await contextWith({}))).toBe("Not set up");
  });

  it("says the model and the turn limit for the Assistant", async () => {
    const context = await contextWith({
      "assistant.provider": "anthropic",
      "assistant.model": "smart",
      "assistant.turn-limit": 16,
    });
    expect(assistantSummary(context)).toBe("smart · turn limit 16");
  });

  it("names the provider when the Assistant has no model", async () => {
    const context = await contextWith({
      "assistant.provider": "anthropic",
      "assistant.turn-limit": 8,
    });
    expect(assistantSummary(context)).toBe("Anthropic · turn limit 8");
  });

  it("says the sandbox chip's words once the check answers", async () => {
    const context = await contextWith(
      {},
      {
        available: true,
        check: async () => ({ state: "ready", checkedAt: "2026-11-14T09:12:00Z" }),
      },
    );
    expect(await agentSandboxSummary(context)).toBe("Ready");
  });

  it("says Not available when the build has no sandbox", async () => {
    expect(await agentSandboxSummary(await contextWith({}, { available: false }))).toBe(
      "Not available",
    );
  });

  it("leaves the sandbox summary out without a host", async () => {
    expect(await agentSandboxSummary(await contextWith({}))).toBeUndefined();
  });
});
