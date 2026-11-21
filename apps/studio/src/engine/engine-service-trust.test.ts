import type { SetTimer } from "@halonicjs/adapter-scheduler-node";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { acmeFiles, fakeShell, lockCalls, serviceOn } from "./engine-service.testing.ts";
import type { EngineServiceOptions } from "./engine-service.ts";
import type { StudioHarnessHost } from "./studio-harness-host.ts";

verifies("studio.untrusted-starts-nothing", () => {
  const reply = { hubId: "support", workflowId: "reply" };
  /** Kim's workspace (HAL-12407): a keyless model server on this computer. */
  const keylessLocal = () =>
    acmeFiles(
      { writer: "model: ollama/qwen3\n" },
      {
        "providers/ollama.yaml": [
          "id: ollama",
          "type: openai-compatible",
          "baseUrl: http://localhost:11434/v1",
          "local: true",
          "",
        ].join("\n"),
      },
    );
  const refusal = {
    kind: "denied",
    code: "workspace.untrusted",
    message: "This workspace isn't trusted yet, so nothing was started.",
  };

  /** A client that records each address it is asked to call. */
  function recordingHttp() {
    const sent: string[] = [];
    return {
      sent,
      http: {
        fetch: async (url: string) => {
          sent.push(url);
          throw new TypeError("Failed to fetch");
        },
      },
    };
  }

  it("refuses a run of an untrusted workspace, sends nothing and gives the lock back", async () => {
    const shell = fakeShell();
    const { sent, http } = recordingHttp();
    const service = serviceOn(shell, keylessLocal(), {
      http,
      isTrusted: async () => false,
      mayStart: async () => false,
    });

    await expect(service.startRun(reply, {})).rejects.toMatchObject(refusal);

    expect(sent).toEqual([]);
    expect(lockCalls(shell)).toEqual(["engine_lock_hold", "engine_lock_release"]);
    expect(shell.calls).not.toContain("run_append");
  });

  it("refuses a routine's Run now the same way", async () => {
    const shell = fakeShell();
    const service = serviceOn(shell, keylessLocal(), { mayStart: async () => false });

    await expect(
      service.startRoutine(
        { workflow: { ...reply, input: {} } },
        { routineKey: "support/daily", at: "2026-11-18T09:00:00.000Z" },
      ),
    ).rejects.toMatchObject(refusal);
    expect(shell.calls).not.toContain("run_append");
  });

  it("asks about the workspace the engine loaded, and fails closed when the check fails", async () => {
    const asked: unknown[] = [];
    const service = serviceOn(fakeShell(), keylessLocal(), {
      mayStart: async (workspace) => {
        asked.push(workspace);
        throw new Error("The trust record can't be read.");
      },
    });

    await expect(service.startRun(reply, {})).rejects.toMatchObject(refusal);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toHaveProperty("files");
  });

  it("refuses the next start once the workspace may start nothing, with the engine still open", async () => {
    let trusted = true;
    const service = serviceOn(fakeShell(), acmeFiles(), { mayStart: async () => trusted });
    await service.startRun(reply, {});

    trusted = false;

    await expect(service.startRun(reply, {})).rejects.toMatchObject(refusal);
    await service.close();
  });

  describe("trust removed while the engine is open (HAL-12799)", () => {
    const coder = acmeFiles({ writer: "harness: claude-code\n" });

    /** A trust that a test changes, telling the engine as the page's trust does. */
    function removableTrust() {
      const listeners = new Set<() => void>();
      const state = { trusted: true as boolean | "fails" };
      const isTrusted = async () => {
        if (state.trusted === "fails") throw new Error("The trust record can't be read.");
        return state.trusted;
      };
      return {
        isTrusted,
        mayStart: isTrusted,
        onTrustChange: (listener: () => void) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        /** Changes the trust; `quietly`, as a terminal does, without telling the engine. */
        change(to: boolean | "fails", { quietly = false } = {}) {
          state.trusted = to;
          if (quietly) return;
          for (const listener of listeners) listener();
        },
        listeners,
      };
    }

    /** The scheduler's wake-ups, which a test fires by hand, cancelled ones included. */
    function handTimers() {
      const all: (() => void)[] = [];
      const armed = new Set<() => void>();
      const setTimer: SetTimer = (callback) => {
        all.push(callback);
        armed.add(callback);
        return () => armed.delete(callback);
      };
      const fireAll = () => {
        for (const callback of all.splice(0)) callback();
      };
      return { setTimer, armed, fireAll };
    }

    /** A harness host whose placement records each harness step it is asked to start. */
    function recordingHarnessHost() {
      const steps: string[] = [];
      const harnesses = {
        placement: {
          where: async (agent: { runId: string }) => {
            steps.push(agent.runId);
            throw new Error("The test stops the harness step here.");
          },
        },
        sandboxes: {},
        harnesses: { "claude-code": {} },
      } as unknown as StudioHarnessHost["harnesses"];
      const host: StudioHarnessHost = {
        harnesses,
        proposalFolders: {
          open: async () => "/acme-proposal",
          folderOf: async () => "/acme-proposal",
          end: async () => {},
        },
        start: async () => {},
      };
      return { steps, openHarnessHost: async () => host };
    }

    /** A run of `reply` whose harness step waits on its timer, on a trusted, open engine. */
    async function harnessRunWaiting(options: Partial<EngineServiceOptions> = {}) {
      const shell = fakeShell();
      const trust = removableTrust();
      const timers = handTimers();
      const harness = recordingHarnessHost();
      const service = serviceOn(shell, coder, {
        isTrusted: trust.isTrusted,
        mayStart: trust.mayStart,
        onTrustChange: trust.onTrustChange,
        setTimer: timers.setTimer,
        openHarnessHost: harness.openHarnessHost,
        ...options,
      });
      const { id } = await service.startRun(reply, {});
      return { shell, trust, timers, harness, service, id };
    }

    const released = (shell: ReturnType<typeof fakeShell>) =>
      lockCalls(shell).includes("engine_lock_release");

    it("stays open while the workspace is still trusted, and runs the harness step from its timer", async () => {
      const { trust, timers, harness, service, id } = await harnessRunWaiting();

      // As each save checks the trust again.
      trust.change(true);
      timers.fireAll();
      await waitUntil("the harness step", () => harness.steps.length > 0);

      expect(harness.steps).toEqual([id]);
      await service.close();
    });

    it("closes the engine as closing the workspace does, so the harness step doesn't run", async () => {
      const { shell, trust, timers, harness, service } = await harnessRunWaiting();

      trust.change(false);
      await waitUntil("the engine's lock given back", () => released(shell));
      // Even a wake-up that was already due delivers nothing once the engine is closed.
      expect(timers.armed.size).toBe(0);
      timers.fireAll();
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(harness.steps).toEqual([]);
      expect(lockCalls(shell)).toEqual(["engine_lock_hold", "engine_lock_release"]);
      await expect(service.startRun(reply, {})).rejects.toMatchObject(refusal);
    });

    it("closes the engine when the check fails, failing closed", async () => {
      const { shell, trust } = await harnessRunWaiting();

      trust.change("fails");
      await waitUntil("the engine's lock given back", () => released(shell));

      expect(lockCalls(shell)).toEqual(["engine_lock_hold", "engine_lock_release"]);
    });

    it("refuses the next harness step when the trust goes where the window doesn't hear it (HAL-12811)", async () => {
      const { trust, timers, harness, service, id } = await harnessRunWaiting();

      // As `halonic trust --remove` in a terminal: the trust is gone, and no listener is told.
      trust.change(false, { quietly: true });
      timers.fireAll();
      const { runs } = await service.open();
      await waitUntil("the run failed", async () => (await runs.get(id))?.status === "failed");

      expect(harness.steps).toEqual([]);
      expect(await runs.get(id)).toMatchObject({
        status: "failed",
        error: `Agent "writer" runs in claude-code, and this workspace isn't trusted on this computer, so Halonic didn't start it.`,
      });
      await service.close();
    });

    it("asks the trust itself before a harness step, not whether the workspace may start (HAL-12811)", async () => {
      // A resumed run's step runs from its kept definitions, which can have a harness agent the
      // loaded workspace no longer has, so `mayStart` can say yes where the trust says no.
      const { trust, timers, harness, service, id } = await harnessRunWaiting({
        mayStart: async () => true,
      });

      trust.change(false, { quietly: true });
      timers.fireAll();
      const { runs } = await service.open();
      await waitUntil("the run failed", async () => (await runs.get(id))?.status === "failed");

      expect(harness.steps).toEqual([]);
      await service.close();
    });

    it("stops hearing the trust once the workspace closes", async () => {
      const { trust, service } = await harnessRunWaiting();

      await service.dispose();

      expect(trust.listeners.size).toBe(0);
    });
  });
});
