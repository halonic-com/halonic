// End to end in the Studio (HAL-10849): a Claude Code agent's bridge asks for
// a person's OK, and a card or a phone answers it through the engine. The
// chain is the Studio's own: `EngineService`, `openStudioHarnessHost`,
// `AgentHostBridges` over the host's routes, then the engine's approvals.

import type { RunEvent } from "@halonicjs/events";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { acmeFiles, fakeShell, location, serviceOn } from "./engine-service.testing.ts";
import type { EngineService } from "./engine-service.ts";
import { FakeAgentHost } from "./fake-agent-host.testing.ts";
import { openStudioHarnessHost } from "./studio-harness-host.ts";

const reply = { hubId: "support", workflowId: "reply" };

/** A run of Acme's `reply`, whose writer runs in Claude Code on the agent host. */
async function runOnAgentHost() {
  const host = new FakeAgentHost();
  const definitions = acmeFiles({ writer: "harness: claude-code\n" });
  let next = 0;
  const service = serviceOn(fakeShell(), definitions, {
    ids: { next: (prefix) => `${prefix}${++next}` },
    // The scheduler's timers go off, so the run moves on by itself.
    setTimer: (callback, delayMs) => {
      const timer = setTimeout(callback, Math.min(delayMs, 10));
      return () => clearTimeout(timer);
    },
    openHarnessHost: (decisions) =>
      openStudioHarnessHost({
        transport: host,
        location,
        definitions,
        digest: { sha256: async () => new Uint8Array(32) },
        clock: { now: () => new Date("2026-11-18T10:00:00.000Z") },
        instructionTrust: { check: async () => ({ kind: "trusted" }) },
        ...decisions,
        reportError: () => {},
      }),
  });
  const { id } = await service.startRun(reply, {});
  const events = await eventsOf(service, id);
  return { host, service, id, events };
}

/** The run's events as they come, kept in order. */
async function eventsOf(service: EngineService, runId: string): Promise<RunEvent[]> {
  const events: RunEvent[] = [];
  const { executor } = await service.open();
  executor.subscribe(runId, 0, { onEvent: (event) => events.push(event), onClose: () => {} });
  return events;
}

/** The engine's call id of the question the run waits on: the one the card shows. */
async function cardQuestion(events: RunEvent[]): Promise<string> {
  return vi.waitFor(() => {
    const asked = events.find((event) => event.type === "approval.requested");
    if (asked === undefined) throw new Error("The run hasn't asked yet.");
    return (asked as { callId: string }).callId;
  });
}

/** Who decided the question, as the run logged it. */
function resolvers(events: RunEvent[]): unknown[] {
  return events
    .filter((event) => event.type === "approval.resolved")
    .map((event) => (event as { by?: unknown }).by);
}

/** Waits until the run has ended, and gives its last event. */
async function endOf(events: RunEvent[]): Promise<RunEvent> {
  return vi.waitFor(() => {
    const last = events.at(-1);
    if (last?.type !== "run.completed" && last?.type !== "run.failed") {
      throw new Error("The run hasn't ended yet.");
    }
    return last;
  });
}

verifies("studio.engine-service", () => {
  describe("a Claude Code approval, end to end through the agent host", () => {
    it("is allowed from the card", async () => {
      const { host, service, id, events } = await runOnAgentHost();
      const callId = await cardQuestion(events);
      const { executor } = await service.open();

      await executor.send(id, "approve", undefined, { callId });

      expect(await host.answer).toEqual({ approved: true });
      expect((await endOf(events)).type).toBe("run.completed");
      await service.close();
    });

    it("is denied from the card", async () => {
      const { host, service, id, events } = await runOnAgentHost();
      const callId = await cardQuestion(events);
      const { executor } = await service.open();

      await executor.send(id, "reject", undefined, { callId });

      expect(await host.answer).toEqual({ approved: false });
      await endOf(events);
      await service.close();
    });

    it("is allowed from a phone, and the run logs the device", async () => {
      const { host, service, events } = await runOnAgentHost();
      await cardQuestion(events);

      host.decideFromPhone(true);

      expect(await host.phoneAnswer).toEqual({ status: "decided" });
      expect(await host.answer).toEqual({ approved: true });
      expect(resolvers(events)).toEqual(["remote-device"]);
      expect((await endOf(events)).type).toBe("run.completed");
      await service.close();
    });

    it("is denied from a phone", async () => {
      const { host, service, events } = await runOnAgentHost();
      await cardQuestion(events);

      host.decideFromPhone(false);

      expect(await host.phoneAnswer).toEqual({ status: "decided" });
      expect(await host.answer).toEqual({ approved: false });
      expect(resolvers(events)).toEqual(["remote-device"]);
      await endOf(events);
      await service.close();
    });

    it("ends as denied when nobody answers and the run is cancelled", async () => {
      const { host, service, id, events } = await runOnAgentHost();
      await cardQuestion(events);
      const { executor } = await service.open();

      await executor.cancel?.(id);

      // Nobody can answer any more, so the bridge says no, never yes.
      expect(await host.answer).toMatchObject({ approved: false });
      expect(await endOf(events)).toMatchObject({ type: "run.failed", reason: "cancelled" });
      await service.close();
    });
  });
});
