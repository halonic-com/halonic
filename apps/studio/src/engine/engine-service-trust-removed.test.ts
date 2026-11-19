import { TauriRunStore } from "@halonicjs/adapter-fs-tauri";
import type { SetTimer } from "@halonicjs/adapter-scheduler-node";
import { verifies, waitUntil } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { acmeFiles, fakeShell, location, lockCalls, serviceOn } from "./engine-service.testing.ts";
import type { PageEngineLock } from "./engine-service.ts";

verifies("studio.trust-removed-ends-runs", () => {
  const reply = { hubId: "support", workflowId: "reply" };
  /** Kim's Local (C210): Acme with a keyless Ollama as its model, so it needs trust. */
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

  /** A model server that holds every call until it is stopped, and records that one came. */
  function heldModel(onStop: () => void = () => {}) {
    const calls: string[] = [];
    const http = {
      fetch: (url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          calls.push(url);
          init?.signal?.addEventListener("abort", () => {
            onStop();
            reject(init.signal?.reason);
          });
        }),
    };
    return { calls, http };
  }

  /** A trust that a test removes, telling the engine as the page's trust does. */
  function removableTrust() {
    const listeners = new Set<() => void>();
    let trusted = true;
    return {
      mayStart: async () => trusted,
      onTrustChange: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      remove() {
        trusted = false;
        for (const listener of listeners) listener();
      },
      restore() {
        trusted = true;
      },
    };
  }

  const setTimer: SetTimer = (callback, delayMs) => {
    const timer = setTimeout(callback, delayMs);
    return () => clearTimeout(timer);
  };

  /**
   * A run of `reply` held in its model call, on a trusted, open engine. `onStop` hears when the
   * engine stops the call; `lock` wraps the shell's lock.
   */
  async function runHeldInItsModelCall(
    onStop?: (shell: ReturnType<typeof fakeShell>) => void,
    lock?: (shell: ReturnType<typeof fakeShell>) => PageEngineLock,
  ) {
    const shell = fakeShell();
    const model = heldModel(() => onStop?.(shell));
    const trust = removableTrust();
    const service = serviceOn(shell, keylessLocal(), {
      http: model.http,
      mayStart: trust.mayStart,
      onTrustChange: trust.onTrustChange,
      setTimer,
      lock: lock?.(shell) ?? shell.lock,
    });
    const { id } = await service.startRun(reply, {});
    await waitUntil("the model call", () => model.calls.length > 0);
    const runs = new TauriRunStore(shell.ipc, location);
    return { shell, trust, service, id, runs };
  }

  it("ends the run it stopped at once, failed as interrupted with the trust's cause", async () => {
    const { trust, service, id, runs } = await runHeldInItsModelCall();
    expect((await runs.get(id))?.status).toBe("running");

    trust.remove();
    await waitUntil("the run ended", async () => (await runs.get(id))?.status === "failed");

    expect(await runs.get(id)).toMatchObject({
      status: "failed",
      reason: "interrupted",
      cause: { kind: "denied", code: "workspace.trust-removed" },
      statesVisited: ["write"],
    });
    expect(await runs.list({ status: ["running"] })).toEqual([]);
    await service.dispose();
  });

  it("holds the workspace's lock until the run is ended, so no other engine starts one in between", async () => {
    // What the run says the moment the lock is free, when another engine, the CLI's, could take it.
    const statusAtRelease: (string | undefined)[] = [];
    let statusNow = async (): Promise<string | undefined> => undefined;
    const { shell, trust, service, id, runs } = await runHeldInItsModelCall(undefined, (shell) => ({
      hold: async (onLost) => {
        const held = await shell.lock.hold(onLost);
        return {
          release: async () => {
            statusAtRelease.push(await statusNow());
            await held.release();
          },
        };
      },
    }));
    statusNow = async () => (await runs.get(id))?.status;
    expect(await statusNow()).toBe("running");

    trust.remove();
    await waitUntil("the lock given back", () => statusAtRelease.length > 0);
    await service.dispose();

    expect(statusAtRelease).toEqual(["failed"]);
    expect(lockCalls(shell)).toEqual(["engine_lock_hold", "engine_lock_release"]);
  });

  it("opens an engine again only after the run is ended, and leaves it ended", async () => {
    let reopened: Promise<unknown> | undefined;
    const { shell, trust, service, id, runs } = await runHeldInItsModelCall(() => {
      // Trusted again and opened while the engine is closing: it waits for the ending.
      trust.restore();
      reopened = service.open();
    });

    trust.remove();
    await waitUntil("the engine opened again", () => reopened !== undefined);
    await reopened;

    expect(lockCalls(shell)).toEqual([
      "engine_lock_hold",
      "engine_lock_release",
      "engine_lock_hold",
    ]);
    expect(await runs.get(id)).toMatchObject({
      status: "failed",
      cause: { kind: "denied", code: "workspace.trust-removed" },
    });
    await service.dispose();
  });

  it("ends nothing when another process took the lock over before the ending, whose runs they may be", async () => {
    const { shell, trust, service, id, runs } = await runHeldInItsModelCall((shell) => {
      // The computer slept and the CLI took the lock over while the engine was closing.
      shell.loseLock();
    });

    trust.remove();
    await waitUntil("the lock given back", () => lockCalls(shell).includes("engine_lock_release"));
    await service.dispose();

    expect((await runs.get(id))?.status).toBe("running");
    expect(lockCalls(shell)).toEqual(["engine_lock_hold", "engine_lock_release"]);
  });
});
