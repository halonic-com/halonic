import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import type { SetTimer } from "@halonicjs/adapter-scheduler-node";
import type { BridgeApprovals, Clock, IdGenerator, Secrets } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { EngineService, type EngineServiceOptions } from "./engine-service.ts";
import type { StudioHarnessHost } from "./studio-harness-host.ts";

const location = "/acme";

/** Acme's `support` hub: `reply` runs the `writer` agent, plus the agents the refusals need. */
function acmeFiles(
  agents: Record<string, string> = {},
  more: Record<string, string> = {},
): MemoryDefinitionStore {
  const files: Record<string, string> = {
    "workspace.yaml": "id: acme\nname: Acme\n",
    "hubs/support/hub.yaml": "id: support\nname: Support\n",
    "hubs/support/workflows/reply.workflow.yaml": [
      "id: reply",
      "name: Reply",
      "initial: write",
      "states:",
      "  write:",
      "    agent: writer",
      "    on:",
      "      - to: done",
      "  done:",
      "    type: final",
      "",
    ].join("\n"),
    "hubs/support/agents/writer.agent.yaml": "id: writer\nname: Writer\n",
    ...more,
  };
  for (const [id, text] of Object.entries(agents)) {
    files[`hubs/support/agents/${id}.agent.yaml`] = `id: ${id}\nname: ${id}\n${text}`;
  }
  return new MemoryDefinitionStore(files);
}

type Handler = (args: Record<string, unknown>) => unknown;

/**
 * What the shell keeps for one engine: run logs and snapshots, blobs, and records the scheduler keeps its timers in.
 * Each command is a handler, so a test starts a run on the page's own stores.
 */
function shellStores(): Record<string, Handler> {
  const logs = new Map<string, string[]>();
  const snapshots = new Map<string, string>();
  const blobs = new Map<string, string>();
  const records = new Map<string, string>();
  return {
    run_append: ({ runId, expectedSeq, lines, snapshot }) => {
      const log = logs.get(runId as string) ?? [];
      const seq = log.join("").split("\n").length - 1;
      if (seq !== expectedSeq) return { ok: false, reason: "conflict", lastSeq: seq };
      logs.set(runId as string, [...log, ...(lines as string[])]);
      if (snapshot !== null) snapshots.set(runId as string, snapshot as string);
      return {
        ok: true,
        lastSeq: [...log, ...(lines as string[])].join("").split("\n").length - 1,
      };
    },
    run_events: ({ runId }) => (logs.get(runId as string) ?? []).join(""),
    run_snapshot: ({ runId }) => {
      const text = snapshots.get(runId as string);
      return text === undefined
        ? null
        : { text, logEvents: logs.get(runId as string)?.length ?? 0 };
    },
    run_logs: () => [],
    blob_put: ({ data }) => {
      const hash = blobs.size.toString(16).padStart(64, "0");
      blobs.set(hash, data as string);
      return { hash };
    },
    blob_get: ({ hash }) => blobs.get(hash as string) ?? null,
    record_read: ({ collection }) => {
      const lines = records.get(collection as string) ?? "";
      return { lines, version: String(lines.length), file: "records" };
    },
    record_append: ({ appends }) => {
      for (const { collection, lines } of appends as { collection: string; lines: string }[]) {
        records.set(collection, (records.get(collection) ?? "") + lines);
      }
    },
    record_replace: () => ({ status: "replaced" }),
  };
}

/** A shell that holds the engine lock for one process and records each call. */
function fakeShell(holder?: { pid: number }) {
  const calls: string[] = [];
  const stores = shellStores();
  return {
    calls,
    ipc: {
      invoke: async (command: string, args?: unknown) => {
        calls.push(command);
        if (command === "engine_lock_hold" && holder !== undefined) {
          throw { kind: "conflict", message: "held", pid: holder.pid };
        }
        return stores[command]?.((args ?? {}) as Record<string, unknown>);
      },
    },
  };
}

/** The calls that took or gave back the lock, in order. */
function lockCalls(shell: ReturnType<typeof fakeShell>): string[] {
  return shell.calls.filter((call) => call.startsWith("engine_lock_"));
}

function serviceOn(
  shell: ReturnType<typeof fakeShell>,
  definitions: MemoryDefinitionStore = acmeFiles(),
  more: Partial<EngineServiceOptions> = {},
): EngineService {
  const secrets: Secrets = { get: async () => null };
  const clock: Clock = { now: () => new Date("2026-11-15T10:00:00.000Z") };
  const ids: IdGenerator = { next: (prefix) => `${prefix}1` };
  return new EngineService({
    ipc: shell.ipc,
    location,
    definitions,
    secrets,
    http: { fetch },
    clock,
    isTrusted: async () => true,
    ids,
    setTimer: () => () => {},
    newToken: () => "token",
    reportError: () => {},
    ...more,
  });
}

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

    it("refuses as `conflict` naming the other process when another engine holds it", async () => {
      const service = serviceOn(fakeShell({ pid: 4242 }));

      const refusal = await service.open().catch((error: unknown) => error);

      expect(refusal).toBeInstanceOf(KindedError);
      expect(refusal).toMatchObject({ kind: "conflict" });
      expect((refusal as Error).message).toContain("4242");
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

      expect(refusal).toMatchObject({ kind: "unavailable" });
      expect((refusal as Error).message).toContain("writer");
      expect(shell.calls).toEqual([]);
    });

    it("refuses an agent that lists a connector as `unavailable`", async () => {
      const service = serviceOn(fakeShell(), acmeFiles({ writer: "connectors: [mail]\n" }));

      await expect(service.check(reply)).rejects.toMatchObject({ kind: "unavailable" });
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

    it("sends an agent's model call through the given `http`, with the key from `secrets`", async () => {
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
      const service = serviceOn(fakeShell(), files, { http, secrets, setTimer });

      try {
        await service.startRun(reply, {});
        await vi.waitFor(() => expect(requests).not.toEqual([]));

        expect(requests[0]?.url).toMatch(/^https:\/\/models\.example\.com\/v1\//);
        expect(requests[0]?.authorization).toBe("Bearer fake-key");
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

    it("refuses a routine's agent as `unavailable` while agent runs aren't built", async () => {
      const service = serviceOn(fakeShell());

      await expect(
        service.startRoutine(
          { agent: { hubId: "support", agentId: "writer", prompt: "Go." } },
          { routineKey: "support/weekly", at: "2026-11-15T10:00:00.000Z" },
        ),
      ).rejects.toMatchObject({ kind: "unavailable" });
      await service.close();
    });

    it.each([
      ["in a harness", "harness: claude-code\n"],
      ["that lists a connector", "connectors: [mail]\n"],
    ])("refuses a routine's agent %s before the lock is taken", async (_, writer) => {
      const shell = fakeShell();
      const service = serviceOn(shell, acmeFiles({ writer }));

      const refusal = await service
        .startRoutine(
          { agent: { hubId: "support", agentId: "writer", prompt: "Go." } },
          { routineKey: "support/weekly", at: "2026-11-15T10:00:00.000Z" },
        )
        .catch((error: unknown) => error);

      expect(refusal).toMatchObject({ kind: "unavailable" });
      expect((refusal as Error).message).toContain("writer");
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

  describe("with an agent host", () => {
    const reply = { hubId: "support", workflowId: "reply" };
    const coder = acmeFiles({ writer: "harness: claude-code\n" });

    /** A harness host that records its start, and keeps the approvals it was given. */
    function fakeHarnessHost() {
      const started: ReadonlySet<string>[] = [];
      let approvalsOf: ((runId: string) => BridgeApprovals | undefined) | undefined;
      const host: StudioHarnessHost = {
        harnesses: {} as StudioHarnessHost["harnesses"],
        proposalFolders: {
          open: async () => "/acme-proposal",
          folderOf: async () => null,
          end: async () => {},
        },
        start: async (openRuns) => {
          started.push(openRuns);
        },
      };
      const openHarnessHost = async (given: typeof approvalsOf) => {
        approvalsOf = given;
        return host;
      };
      return { started, openHarnessHost, approvalsOf: (runId: string) => approvalsOf?.(runId) };
    }

    it("passes an agent in a harness, and still refuses one that lists a connector", async () => {
      const { openHarnessHost } = fakeHarnessHost();
      await expect(serviceOn(fakeShell(), coder, { openHarnessHost }).check(reply)).resolves.toBe(
        undefined,
      );
      const mail = acmeFiles({ writer: "harness: claude-code\nconnectors: [mail]\n" });
      await expect(
        serviceOn(fakeShell(), mail, { openHarnessHost }).check(reply),
      ).rejects.toMatchObject({ kind: "unavailable" });
    });

    it("starts the harness host with the open runs before the engine, and serves the engine's approvals", async () => {
      const harness = fakeHarnessHost();
      const service = serviceOn(fakeShell(), coder, { openHarnessHost: harness.openHarnessHost });
      await service.open();

      expect(harness.started).toEqual([new Set()]);
      // The engine's own approvals: with no harness call going on in the run, not approved.
      const approvals = harness.approvalsOf("run_1");
      const request = { callId: "toolu_1", tool: "Bash", args: {} };
      const signal = new AbortController().signal;
      await expect(approvals?.request(request, { signal })).resolves.toMatchObject({
        approved: false,
      });
      await service.close();
    });

    it("opens the engine without harnesses when the agent host can't be reached, and says why", async () => {
      const reported: unknown[] = [];
      const unreachable = new Error("The agent host isn't running.");
      const service = serviceOn(fakeShell(), coder, {
        openHarnessHost: async () => {
          throw unreachable;
        },
        reportError: (error) => reported.push(error),
      });

      await expect(service.open()).resolves.toBeDefined();
      expect(reported).toEqual([unreachable]);
      await service.close();
    });
  });
});
