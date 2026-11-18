import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import type { SetTimer } from "@halonicjs/adapter-scheduler-node";
import type { KeyOrigins, Secrets } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { acmeFiles, fakeShell, lockCalls, serviceOn } from "./engine-service.testing.ts";
import { WindowCantStart } from "./page-refusal.ts";

verifies("studio.engine-service", () => {
  describe("the engine's lock", () => {
    it("is taken on the first open, and kept for the next", async () => {
      const shell = fakeShell();
      const service = serviceOn(shell);

      const first = await service.open();
      const second = await service.open();

      expect(second).toBe(first);
      expect(lockCalls(shell)).toEqual(["engine_lock_hold"]);
      await service.close();
    });

    it("is not taken before the first open", async () => {
      const shell = fakeShell();

      serviceOn(shell);

      expect(shell.calls).toEqual([]);
    });

    it("is given back when the service closes, and taken again by the next open", async () => {
      const shell = fakeShell();
      const service = serviceOn(shell);
      await service.open();

      await service.close();
      await service.close();
      await service.open();

      expect(lockCalls(shell)).toEqual([
        "engine_lock_hold",
        "engine_lock_release",
        "engine_lock_hold",
      ]);
      await service.close();
    });

    it("refuses as `conflict` in plain words when another engine holds it, and logs the process", async () => {
      const reportError = vi.fn();
      const service = serviceOn(fakeShell({ pid: 4242 }), acmeFiles(), { reportError });

      const refusal = await service.open().catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(KindedError);
      expect(refusal).toMatchObject({
        kind: "conflict",
        message: "Acme is already running in another Halonic on this computer (process 4242).",
        fix: "Stop that one, then try again.",
      });
    });

    it("refuses without a process when the shell names none", async () => {
      const service = serviceOn(fakeShell({}));

      const refusal = await service.open().catch((error: unknown) => error);

      expect(refusal).toMatchObject({
        kind: "conflict",
        message: "Acme is already running in another Halonic on this computer.",
        fix: "Stop that one, then try again.",
      });
    });

    it("closes the engine when the shell loses the lock, and is taken again by the next open", async () => {
      const shell = fakeShell();
      const reportError = vi.fn();
      const service = serviceOn(shell, acmeFiles(), { reportError });
      const first = await service.open();

      shell.loseLock();
      await vi.waitFor(() => expect(lockCalls(shell)).toContain("engine_lock_release"));
      const second = await service.open();

      expect(second).not.toBe(first);
      expect(reportError).toHaveBeenCalledWith(
        new Error("The engine lock was taken over by another process."),
      );
      expect(lockCalls(shell)).toEqual([
        "engine_lock_hold",
        "engine_lock_release",
        "engine_lock_hold",
      ]);
      await service.close();
    });

    it("refuses a lock it can't write as `unavailable`, keeping the shell's words for Copy details", async () => {
      const denied = { kind: "io", message: "Permission denied (os error 13)" };
      const service = serviceOn(fakeShell({ refusal: denied }));

      const refusal = await service.open().catch((error: unknown) => error);

      expect(refusal).toMatchObject({
        kind: "unavailable",
        message: "Halonic can't write to its data folder.",
        details: "Permission denied (os error 13)",
      });
    });

    it("refuses a folder the window hasn't open as a failure it can't explain", async () => {
      const notOpen = { kind: "folder_not_open", message: "This folder isn't open in the window." };
      const service = serviceOn(fakeShell({ refusal: notOpen }));

      const refusal = await service.open().catch((error: unknown) => error);

      expect(refusal).toMatchObject({
        kind: "internal",
        details: "This folder isn't open in the window.",
      });
    });

    it("is given back when the workspace's files can't be read", async () => {
      const shell = fakeShell();
      const unreadable = new MemoryDefinitionStore({});
      unreadable.list = async () => {
        throw new Error("the folder is gone");
      };
      const service = serviceOn(shell, unreadable);

      await expect(service.open()).rejects.toThrow("the folder is gone");

      expect(lockCalls(shell)).toEqual(["engine_lock_hold", "engine_lock_release"]);
    });
  });

  describe("a workflow the window can't run", () => {
    const reply = { hubId: "support", workflowId: "reply" };

    it("passes a workflow of agents that use models only", async () => {
      await expect(serviceOn(fakeShell()).check(reply)).resolves.toBeUndefined();
    });

    it("refuses an agent in a harness as `unavailable`, before the engine opens", async () => {
      const shell = fakeShell();
      const service = serviceOn(shell, acmeFiles({ writer: "harness: claude-code\n" }));

      const refusal = await service.check(reply).catch((error: unknown) => error);

      // The command line refuses Claude Code and Codex agents too, so the fix is the Harness page.
      expect(refusal).toMatchObject({
        kind: "unavailable",
        message: "writer runs in Claude Code, which Halonic can't start yet.",
        fix: "Set writer to Halonic on its Harness page to run it now.",
        command: undefined,
      });
      expect(shell.calls).toEqual([]);
    });

    it("refuses an agent that lists a connector as `unavailable`, with the command that starts it", async () => {
      const service = serviceOn(fakeShell(), acmeFiles({ writer: "connectors: [mail]\n" }));

      await expect(service.check(reply)).rejects.toMatchObject({
        kind: "unavailable",
        message: "writer uses a connector, which Studio can't start yet.",
        fix: "To start it, run this in a terminal:",
        command: "halonic run reply",
      });
    });

    it("names the hub in the command when another hub has a workflow of the same id", async () => {
      const billing = {
        "hubs/billing/hub.yaml": "id: billing\nname: Billing\n",
        "hubs/billing/workflows/reply.workflow.yaml":
          "id: reply\nname: Reply\ninitial: done\nstates:\n  done:\n    type: final\n",
      };
      const service = serviceOn(
        fakeShell(),
        acmeFiles({ writer: "connectors: [mail]\n" }, billing),
      );

      await expect(service.check(reply)).rejects.toMatchObject({
        command: "halonic run support/reply",
      });
    });

    describe("with a model provider", () => {
      const providers = {
        "providers/anthropic.yaml": "id: anthropic\ntype: anthropic\nsecret: anthropic-key\n",
        "providers/ollama.yaml": "id: ollama\ntype: ollama\nlocal: true\n",
        "models.yaml": "aliases:\n  smart: { provider: anthropic, model: claude-opus-5-5 }\n",
      };

      it.each([
        ["an alias of a remote provider", "model: smart\n"],
        ["a provider/model name", "model: ollama/qwen3\n"],
        ["a model the workspace doesn't define", "model: ghost\n"],
      ])("passes an agent whose model is %s", async (_, model) => {
        const service = serviceOn(fakeShell(), acmeFiles({ writer: model }, providers));

        await expect(service.check(reply)).resolves.toBeUndefined();
      });

      it("still refuses an agent in a harness that also names a provider", async () => {
        const writer = "model: smart\nharness: claude-code\n";
        const service = serviceOn(fakeShell(), acmeFiles({ writer }, providers));

        await expect(service.check(reply)).rejects.toMatchObject({ kind: "unavailable" });
      });
    });

    it("says so when the workflow doesn't exist", async () => {
      await expect(
        serviceOn(fakeShell()).check({ hubId: "support", workflowId: "ghost" }),
      ).rejects.toThrow(RangeError);
    });
  });

  describe("starting a run", () => {
    const reply = { hubId: "support", workflowId: "reply" };

    it("refuses a workflow the window can't run before the lock is taken", async () => {
      const shell = fakeShell();
      const service = serviceOn(shell, acmeFiles({ writer: "connectors: [mail]\n" }));

      await expect(service.startRun(reply, {})).rejects.toMatchObject({ kind: "unavailable" });

      expect(shell.calls).toEqual([]);
    });

    it("sends an agent's model call through the given `http`, with the key from `secrets` and its origins from `keyOrigins`", async () => {
      const requests: { url: string; authorization: string | null }[] = [];
      const http = {
        fetch: async (url: string, init?: RequestInit) => {
          requests.push({ url, authorization: new Headers(init?.headers).get("authorization") });
          throw new TypeError("Failed to fetch");
        },
      };
      const secrets: Secrets = { get: async (name) => (name === "acme-key" ? "fake-key" : null) };
      const files = acmeFiles(
        { writer: "model: remote/chat\n" },
        {
          "providers/remote.yaml": [
            "id: remote",
            "type: openai-compatible",
            "baseUrl: https://models.example.com/v1",
            "secret: acme-key",
            "",
          ].join("\n"),
        },
      );
      const globalFetch = vi.spyOn(globalThis, "fetch");
      const setTimer: SetTimer = (callback, delayMs) => {
        const timer = setTimeout(callback, delayMs);
        return () => clearTimeout(timer);
      };
      const asked: string[] = [];
      const keyOrigins: KeyOrigins = {
        allowedOrigins: async (name) => {
          asked.push(name);
          return ["https://models.example.com"];
        },
      };
      const service = serviceOn(fakeShell(), files, { http, secrets, keyOrigins, setTimer });

      try {
        await service.startRun(reply, {});
        await vi.waitFor(() => expect(requests).not.toEqual([]));

        expect(requests[0]?.url).toMatch(/^https:\/\/models\.example\.com\/v1\//);
        expect(requests[0]?.authorization).toBe("Bearer fake-key");
        expect(asked).toContain("acme-key");
        expect(globalFetch).not.toHaveBeenCalled();
      } finally {
        globalFetch.mockRestore();
        await service.close();
      }
    });

    it("opens the engine and starts the run", async () => {
      const shell = fakeShell();
      const service = serviceOn(shell);

      const started = await service.startRun(reply, {});

      expect(started.id).toBe("run1");
      expect(lockCalls(shell)).toEqual(["engine_lock_hold"]);
      await service.close();
    });

    it("starts the run with a manual trigger, so the Runs list doesn't say the terminal started it", async () => {
      const service = serviceOn(fakeShell());
      const { executor } = await service.open();
      const start = vi.spyOn(executor, "start");

      await service.startRun(reply, {});

      expect(start).toHaveBeenCalledWith(
        expect.objectContaining({ trigger: { type: "manual", at: "2026-11-15T10:00:00.000Z" } }),
      );
      await service.close();
    });

    it("refuses as `conflict` when another engine holds the lock", async () => {
      const service = serviceOn(fakeShell({ pid: 7 }));

      await expect(service.startRun(reply, {})).rejects.toMatchObject({ kind: "conflict" });
    });

    it("starts a routine's workflow with a manual trigger that names the routine", async () => {
      const service = serviceOn(fakeShell());
      const { executor } = await service.open();
      const start = vi.spyOn(executor, "start");

      const started = await service.startRoutine(
        { workflow: { ...reply, input: { day: "x" } } },
        { routineKey: "support/weekly", at: "2026-11-15T10:00:00.000Z" },
      );

      expect(started.id).toBe("run1");
      expect(start).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { day: "x" },
          trigger: { type: "manual", routineId: "support/weekly", at: "2026-11-15T10:00:00.000Z" },
        }),
      );
      await service.close();
    });

    it("refuses a routine's agent in the window's own words while agent runs aren't built", async () => {
      const service = serviceOn(fakeShell());

      const refusal = await service
        .startRoutine(
          { agent: { hubId: "support", agentId: "writer", prompt: "Go." } },
          { routineKey: "support/weekly", at: "2026-11-15T10:00:00.000Z" },
        )
        .catch((error: unknown) => error);

      // Its own class, so Run now doesn't call it an engine that isn't answering (HAL-14647).
      expect(refusal).toBeInstanceOf(WindowCantStart);
      expect(refusal).toMatchObject({
        kind: "unavailable",
        message:
          "Halonic can't run an agent on its own yet, only as a step in a workflow. Make a workflow, then pick it under Starts.",
        fix: undefined,
      });
      await service.close();
    });

    it.each([
      [
        "in a harness, with its Harness page step,",
        "harness: claude-code\n",
        {
          message: "writer runs in Claude Code, which Halonic can't start yet.",
          fix: "Set writer to Halonic on its Harness page to run it now.",
        },
      ],
      [
        // `halonic run` starts no single agent, so there is no command to give.
        "that lists a connector, with no next step,",
        "connectors: [mail]\n",
        { message: "writer uses a connector, which Studio can't start yet.", fix: undefined },
      ],
    ])("refuses a routine's agent %s before the lock is taken", async (_, writer, words) => {
      const shell = fakeShell();
      const service = serviceOn(shell, acmeFiles({ writer }));

      const refusal = await service
        .startRoutine(
          { agent: { hubId: "support", agentId: "writer", prompt: "Go." } },
          { routineKey: "support/weekly", at: "2026-11-15T10:00:00.000Z" },
        )
        .catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(WindowCantStart);
      expect(refusal).toMatchObject({ kind: "unavailable", ...words });
      expect(refusal).not.toHaveProperty("command");
      expect(lockCalls(shell)).toEqual([]);
    });

    it("says so when the routine's agent doesn't exist, before the lock is taken", async () => {
      const shell = fakeShell();
      const service = serviceOn(shell);

      await expect(
        service.startRoutine(
          { agent: { hubId: "support", agentId: "ghost", prompt: "Go." } },
          { routineKey: "support/weekly", at: "2026-11-15T10:00:00.000Z" },
        ),
      ).rejects.toThrow(RangeError);
      expect(lockCalls(shell)).toEqual([]);
    });
  });
});
