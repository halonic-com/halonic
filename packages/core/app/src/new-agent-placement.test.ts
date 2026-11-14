import type { Clock, Digest } from "@halonicjs/ports";
import { encodeUtf8 } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { AgentPlacement, type PlacementSubject } from "./agent-placement.ts";
import { HostSettings } from "./host-settings.ts";
import { newAgentPlacement, newAgentsRun } from "./new-agent-placement.ts";
import { TestAgentPlacementStore } from "./testing/test-agent-placement-store.ts";
import { TestHostSettingsStore } from "./testing/test-host-settings-store.ts";

const digest: Digest = {
  async sha256(data) {
    return new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(data)));
  },
};
const clock: Clock = { now: () => new Date("2026-11-14T10:00:00.000Z") };
const subject: PlacementSubject = {
  location: "/workspaces/acme",
  agent: "coder",
  file: encodeUtf8("kind: agent\nid: coder\n"),
};

function setup() {
  const hostStore = new TestHostSettingsStore();
  const settings = new HostSettings(hostStore);
  const placementStore = new TestAgentPlacementStore();
  const placement = new AgentPlacement({ store: placementStore, digest, clock });
  return { hostStore, settings, placement };
}

verifies("app.new-agent-placement", () => {
  it("leaves a new agent in the sandbox when nothing is saved", async () => {
    const { settings, placement } = setup();
    await settings.load();
    expect(await newAgentPlacement(settings, placement, subject)).toEqual({
      ok: true,
      value: "sandbox",
    });
    expect((await placement.where(subject)).runsOn).toBe("sandbox");
  });

  it("records this computer for the agent's file when the setting says so", async () => {
    const { settings, placement } = setup();
    await settings.load();
    await settings.set(newAgentsRun, "this-computer");
    expect(await newAgentPlacement(settings, placement, subject)).toEqual({
      ok: true,
      value: "this-computer",
    });
    expect((await placement.where(subject)).runsOn).toBe("this-computer");
  });

  it("leaves a new agent in the sandbox for a saved value it doesn't know", async () => {
    const { hostStore, settings, placement } = setup();
    await hostStore.set("sandbox.new-agents", "everywhere");
    await settings.load();
    expect(await newAgentPlacement(settings, placement, subject)).toEqual({
      ok: true,
      value: "sandbox",
    });
    expect((await placement.where(subject)).runsOn).toBe("sandbox");
  });

  it("leaves a new agent in the sandbox when the settings couldn't be read", async () => {
    const { hostStore, settings, placement } = setup();
    await hostStore.set("sandbox.new-agents", "this-computer");
    hostStore.readError = new Error("the settings file is busy");
    await expect(settings.load()).rejects.toThrow("busy");
    expect(await newAgentPlacement(settings, placement, subject)).toEqual({
      ok: true,
      value: "sandbox",
    });
    expect((await placement.where(subject)).runsOn).toBe("sandbox");
  });
});
