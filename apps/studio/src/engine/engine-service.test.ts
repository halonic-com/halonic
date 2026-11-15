import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import type { Clock, IdGenerator, Secrets } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { EngineService, type EngineServiceOptions } from "./engine-service.ts";

const location = "/acme";

/** Acme's `support` hub: `reply` runs the `writer` agent, plus the agents the refusals need. */
function acmeFiles(agents: Record<string, string> = {}): MemoryDefinitionStore {
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
  };
  for (const [id, text] of Object.entries(agents)) {
    files[`hubs/support/agents/${id}.agent.yaml`] = `id: ${id}\nname: ${id}\n${text}`;
  }
  return new MemoryDefinitionStore(files);
}

/** A shell that holds the engine lock for one process and records each call. */
function fakeShell(holder?: { pid: number }) {
  const calls: string[] = [];
  return {
    calls,
    ipc: {
      invoke: async (command: string) => {
        calls.push(command);
        if (command === "engine_lock_hold" && holder !== undefined) {
          throw { kind: "conflict", message: "held", pid: holder.pid };
        }
        return undefined;
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

    it("says so when the workflow doesn't exist", async () => {
      await expect(
        serviceOn(fakeShell()).check({ hubId: "support", workflowId: "ghost" }),
      ).rejects.toThrow(RangeError);
    });
  });
});
