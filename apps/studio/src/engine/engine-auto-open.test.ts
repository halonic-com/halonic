import { TauriRecordStore } from "@halonicjs/adapter-fs-tauri";
import type { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import { runTimerCollection } from "@halonicjs/adapter-workspace-models";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { EngineAutoOpen, type EngineAutoOpenParts } from "./engine-auto-open.ts";
import { acmeFiles, fakeShell, location, lockCalls, serviceOn } from "./engine-service.testing.ts";

const routinePath = "hubs/support/workflows/routines/hourly.routine.yaml";

/** A routine of Acme's `reply`, started by `trigger`, on or off. */
function routine(trigger: string, enabled = true): string {
  return `id: hourly\nname: Hourly\nenabled: ${enabled}\ntrigger: ${trigger}\nrun: { workflow: reply }\n`;
}

/** An auto-open on a real engine service and a fake shell, and the way to say something changed. */
function autoOpenOn(
  definitions: MemoryDefinitionStore,
  more: Partial<EngineAutoOpenParts> = {},
  shell = fakeShell(),
) {
  const service = serviceOn(shell, definitions);
  const errors: unknown[] = [];
  const listeners = new Set<() => void>();
  const autoOpen = new EngineAutoOpen({
    open: () => service.open(),
    definitions,
    records: new TauriRecordStore(shell.ipc, location),
    mayStart: async () => true,
    onChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reportError: (error) => errors.push(error),
    ...more,
  });
  const changed = () => {
    for (const listener of listeners) listener();
  };
  return { shell, service, autoOpen, errors, changed, listeners };
}

verifies("studio.engine-service", () => {
  it("takes the engine lock when a trusted workspace with an enabled routine on a clock opens", async () => {
    const { shell, service, autoOpen } = autoOpenOn(
      acmeFiles({}, { [routinePath]: routine('{ schedule: "0 * * * *" }') }),
    );

    await autoOpen.check();

    expect(lockCalls(shell)).toEqual(["engine_lock_hold"]);
    await service.close();
  });

  it("takes it for a waiting run's timer when the workspace has no routine", async () => {
    const shell = fakeShell();
    await new TauriRecordStore(shell.ipc, location).append([
      {
        collection: runTimerCollection,
        op: "add",
        id: "run-1/timer-1",
        at: "2026-11-15T09:00:00.000Z",
        values: { fireAt: "2026-11-15T11:00:00.000Z" },
      },
    ]);
    const { service, autoOpen } = autoOpenOn(acmeFiles(), {}, shell);

    await autoOpen.check();

    expect(lockCalls(shell)).toEqual(["engine_lock_hold"]);
    await service.close();
  });

  it.each([
    ["no routine", acmeFiles()],
    ["a routine that is off", acmeFiles({}, { [routinePath]: routine("{ every: 1h }", false) })],
    ["a manual routine", acmeFiles({}, { [routinePath]: routine("{ manual: true }") })],
  ])("takes no lock for a workspace with %s", async (_case, definitions) => {
    const { shell, autoOpen } = autoOpenOn(definitions);

    await autoOpen.check();

    expect(lockCalls(shell)).toEqual([]);
  });

  it("takes no lock while the workspace may start nothing, and does once it is trusted", async () => {
    let trusted = false;
    const { shell, service, autoOpen, changed } = autoOpenOn(
      acmeFiles({}, { [routinePath]: routine("{ every: 1h }") }),
      { mayStart: async () => trusted },
    );
    await autoOpen.check();
    expect(lockCalls(shell)).toEqual([]);

    trusted = true;
    changed();
    await autoOpen.check();

    expect(lockCalls(shell)).toEqual(["engine_lock_hold"]);
    await service.close();
  });

  it("reports, and shows nothing, when the CLI's engine holds the lock", async () => {
    const { errors, autoOpen } = autoOpenOn(
      acmeFiles({}, { [routinePath]: routine("{ every: 1h }") }),
      {},
      fakeShell({ pid: 4242 }),
    );

    await autoOpen.check();

    expect(errors).toMatchObject([{ kind: "conflict" }]);
  });
});

describe("EngineAutoOpen", () => {
  it("stops listening and opens nothing once disposed", async () => {
    const { shell, autoOpen, listeners } = autoOpenOn(
      acmeFiles({}, { [routinePath]: routine("{ every: 1h }") }),
    );

    autoOpen.dispose();
    await autoOpen.check();

    expect(listeners.size).toBe(0);
    expect(lockCalls(shell)).toEqual([]);
  });
});
