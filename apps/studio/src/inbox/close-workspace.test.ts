import { ServiceRegistry } from "@halonicjs/app";
import type { RunSummary } from "@halonicjs/events";
import { inboxFeature } from "@halonicjs/studio-feature-inbox";
import {
  type InboxRuns,
  InboxRunsService,
  InboxService,
} from "@halonicjs/studio-feature-inbox/api";
import { createShell } from "@halonicjs/studio-shell";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it, vi } from "vitest";

/** Runs with nothing waiting, which count their listeners and loads. */
function watchedRuns() {
  const listeners = new Set<() => void>();
  const waiting = vi.fn(async (): Promise<readonly RunSummary[]> => []);
  const runs: InboxRuns = {
    waiting,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    send: async () => {
      throw new Error("No answers in this test.");
    },
  };
  return { runs, listeners, waiting };
}

verifies("inbox.live", () => {
  it("stops the workspace's Inbox when the workspace closes", async () => {
    const shell = createShell({ features: [inboxFeature], hostServices: [InboxRunsService] });
    const services = new ServiceRegistry();
    const watched = watchedRuns();
    services.provide(InboxRunsService, watched.runs);
    shell.services.instantiate(services);
    const inbox = services.get(InboxService);
    await inbox.refresh();
    const [runChanged] = [...watched.listeners];
    expect(runChanged).toBeDefined();

    await services.dispose();
    expect(watched.listeners.size).toBe(0);
    // A change the runs sent just before they heard the Inbox stop loads nothing.
    const loads = watched.waiting.mock.calls.length;
    runChanged?.();
    expect(watched.waiting).toHaveBeenCalledTimes(loads);
  });
});
