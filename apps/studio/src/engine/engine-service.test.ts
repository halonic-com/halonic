import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import type { Clock, IdGenerator, Secrets } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { EngineService, type EngineServiceOptions } from "./engine-service.ts";

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
 * What the shell keeps for one engine: run logs and snapshots, blobs, and records that stay empty.
 * Each command is a handler, so a test starts a run on the page's own stores.
 */
function shellStores(): Record<string, Handler> {
  const logs = new Map<string, string[]>();
  const snapshots = new Map<string, string>();
  const blobs = new Map<string, string>();
  return {
    run_append: ({ runId, expectedSeq, lines, snapshot }) => {
      const log = logs.get(runId as string) ?? [];
      if (log.length !== expectedSeq) return { ok: false, reason: "conflict", lastSeq: log.length };
      logs.set(runId as string, [...log, ...(lines as string[])]);
      if (snapshot !== null) snapshots.set(runId as string, snapshot as string);
      return { ok: true, lastSeq: log.length + (lines as string[]).length };
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
    record_read: () => ({ lines: "", version: "0", file: "records" }),
    record_append: () => undefined,
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
        "providers/mock.yaml": "id: mock\ntype: mock\n",
        "providers/anthropic.yaml": "id: anthropic\ntype: anthropic\nsecret: anthropic-key\n",
        "providers/ollama.yaml": "id: ollama\ntype: ollama\nlocal: true\n",
        "models.yaml": [
          "aliases:",
          "  smart: { provider: anthropic, model: claude-opus-5-5 }",
          "  steady: { provider: mock, model: echo, fallback: [smart] }",
          "  fast: { provider: mock, model: echo }",
          "",
        ].join("\n"),
      };

      it.each([
        ["an alias of a real provider", "model: smart\n", "anthropic"],
        ["a provider/model name", "model: ollama/qwen3\n", "ollama"],
        ["a mock alias that falls back to a real provider", "model: steady\n", "anthropic"],
      ])("refuses %s as `unavailable`, naming the agent and the provider", async (_, model, id) => {
        const service = serviceOn(fakeShell(), acmeFiles({ writer: model }, providers));

        const refusal = await service.check(reply).catch((error: unknown) => error);

        expect(refusal).toMatchObject({ kind: "unavailable" });
        expect((refusal as Error).message).toContain("writer");
        expect((refusal as Error).message).toContain(`"${id}"`);
      });

      it("passes an agent whose model is the mock model", async () => {
        const service = serviceOn(fakeShell(), acmeFiles({ writer: "model: fast\n" }, providers));

        await expect(service.check(reply)).resolves.toBeUndefined();
      });

      it("passes when a real provider exists that no agent of the workflow reaches", async () => {
        const service = serviceOn(fakeShell(), acmeFiles({ other: "model: smart\n" }, providers));

        await expect(service.check(reply)).resolves.toBeUndefined();
      });

      it("leaves a model the workspace doesn't define to the engine", async () => {
        const service = serviceOn(fakeShell(), acmeFiles({ writer: "model: ghost\n" }, providers));

        await expect(service.check(reply)).resolves.toBeUndefined();
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

    it("never calls a model server for a run it refuses", async () => {
      const urls: string[] = [];
      const http = {
        fetch: async (url: string) => {
          urls.push(url);
          throw new TypeError("Failed to fetch");
        },
      };
      const files = acmeFiles(
        { writer: "model: anthropic/claude-opus-5-5\n" },
        { "providers/anthropic.yaml": "id: anthropic\ntype: anthropic\nsecret: anthropic-key\n" },
      );
      const service = serviceOn(fakeShell(), files, { http });

      await expect(service.startRun(reply, {})).rejects.toMatchObject({ kind: "unavailable" });

      expect(urls).toEqual([]);
    });

    it("opens the engine and starts the run", async () => {
      const shell = fakeShell();
      const service = serviceOn(shell);

      const started = await service.startRun(reply, {});

      expect(started.id).toBe("run1");
      expect(lockCalls(shell)).toEqual(["engine_lock_hold"]);
      await service.close();
    });

    it("refuses as `conflict` when another engine holds the lock", async () => {
      const service = serviceOn(fakeShell({ pid: 7 }));

      await expect(service.startRun(reply, {})).rejects.toMatchObject({ kind: "conflict" });
    });
  });
});
