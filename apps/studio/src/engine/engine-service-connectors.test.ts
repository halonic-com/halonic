// The runs' connectors in the page's engine (HAL-13344): started on the agent host where one runs.

import { webCryptoDigest } from "@halonicjs/adapter-fs-tauri";
import { MemoryToolApprovalStore } from "@halonicjs/adapter-memory";
import type { SetTimer } from "@halonicjs/adapter-scheduler-node";
import { approveAllShown, checkConnectorTools } from "@halonicjs/app/listed-tools";
import type { AssembledEngine, ConnectorsRun } from "@halonicjs/engine";
import type { ChatTurnWaiting, ConnectorClient } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { studioListedToolApproval } from "../connect/studio-run-connectors.ts";
import { acmeFiles, fakeShell, location, lockCalls, serviceOn } from "./engine-service.testing.ts";
import type { StudioRunConnectors } from "./engine-service.ts";

const reply = { hubId: "support", workflowId: "reply" };
const clock = { now: () => new Date("2026-11-15T10:00:00.000Z") };

/** The `mail` connector, a program on this computer whose `lookup` tool only reads. */
const mailConnector =
  "name: Mail\ntransport:\n  stdio:\n    command: mail-mcp\ntools:\n  allow: [lookup]\n  read: [lookup]\n";

/** Acme's writer listing the connector `mail` with `transport`, on a test model that calls `lookup`. */
function writerWithMail(connector = mailConnector) {
  return acmeFiles(
    { writer: "connectors: [mail]\n" },
    {
      "library/connectors/mail.connector.yaml": connector,
      "providers/mock.yaml":
        'id: mock\nname: Test model\ntype: mock\noptions:\n  script:\n    writer: ["tool:lookup {}", "Done"]\n',
      "models.yaml": "aliases:\n  default: { provider: mock, model: echo }\n",
    },
  );
}

/** The page's timers, as the window sets them: a run's next step is one, due at once on the fixed clock. */
const pageTimers: SetTimer = (callback, delayMs) => {
  const timer = setTimeout(callback, delayMs);
  return () => clearTimeout(timer);
};

/** The `mail` server, as the agent host would start it: it lists `lookup` and records each call. */
function mailServer() {
  const calls: string[] = [];
  const client: ConnectorClient = {
    id: "mail",
    local: true,
    listTools: async () => [
      { name: "lookup", description: "Looks up a mail.", parameters: { type: "object" } },
    ],
    callTool: async (name) => {
      calls.push(name);
      return "No mail.";
    },
    close: async () => undefined,
  };
  return { client, calls };
}

/** Connectors that give `clients`, and record which runs opened them and when they closed. */
function recordedConnectors(clients: readonly ConnectorClient[] = []) {
  const opened: ConnectorsRun[] = [];
  const log: string[] = [];
  const connectors: StudioRunConnectors["connectors"] = {
    open: async (run) => {
      opened.push(run);
      return clients;
    },
    end: async (runId) => void log.push(`end ${runId}`),
    closeAll: async () => void log.push("close all"),
  };
  return { connectors, opened, log };
}

/** The runs' connectors and the approvals of `approvals`, as the window builds them. */
function runConnectors(
  definitions: ReturnType<typeof acmeFiles>,
  connectors: StudioRunConnectors["connectors"],
  approvals = new MemoryToolApprovalStore(),
) {
  const heard: { connector: string; waiting: readonly ChatTurnWaiting[] }[] = [];
  const open = async (): Promise<StudioRunConnectors> => ({
    connectors,
    listedToolApproval: await studioListedToolApproval({
      definitions,
      folder: { locationOf: async () => location },
      approvals,
      digest: webCryptoDigest,
      clock,
      reportWaiting: (connector, waiting) => void heard.push({ connector, waiting }),
    }),
  });
  return { open, heard };
}

/** Approves every tool `mail` lists, as "Approve all" in the Library's review does. */
async function approveInTheLibrary(
  definitions: ReturnType<typeof acmeFiles>,
  approvals: MemoryToolApprovalStore,
): Promise<void> {
  const workspace = await loadWorkspace(definitions);
  const mail = filesOf(workspace, "connector").find((file) => file.value.id === "mail");
  if (mail === undefined) throw new Error("Acme has the mail connector.");
  const check = await checkConnectorTools({
    location,
    connector: mail.value,
    listed: await mailServer().client.listTools(),
    trust: { location, fingerprint: "hfp1:test" },
    store: approvals,
    digest: webCryptoDigest,
    clock,
  });
  if (!check.ok) throw new Error(check.error);
  await approveAllShown(check.value, check.value.waiting, approvals, clock);
}

/**
 * Lets the run's steps go until it no longer runs. Bounded by real time, not by rounds: each turn
 * awaits a real WebCrypto digest, which fake timers don't advance and which is slow under load.
 */
async function settle(engine: AssembledEngine, id: string): Promise<string | undefined> {
  return vi.waitFor(
    async () => {
      await vi.advanceTimersByTimeAsync(0);
      const status = (await engine.runs.get(id))?.status;
      expect(status).not.toBe("running");
      return status;
    },
    { timeout: 5000 },
  );
}

verifies("studio.engine-service", () => {
  describe("a run's connectors", () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("are opened for a run of an agent that lists one, which reads the saved files", async () => {
      const definitions = writerWithMail();
      const { connectors, opened } = recordedConnectors();
      const service = serviceOn(fakeShell(), definitions, {
        setTimer: pageTimers,
        openRunConnectors: runConnectors(definitions, connectors).open,
      });

      await expect(service.check(reply)).resolves.toBeUndefined();
      const { id } = await service.startRun(reply, {});
      await vi.advanceTimersByTimeAsync(0);

      expect(opened).toEqual([
        expect.objectContaining({ runId: id, version: { reads: "saved-files" } }),
      ]);
      await service.close();
    });

    it("offer a tool approved in the Library, which the model then calls", async () => {
      const definitions = writerWithMail();
      const approvals = new MemoryToolApprovalStore();
      await approveInTheLibrary(definitions, approvals);
      const mail = mailServer();
      const { open, heard } = runConnectors(
        definitions,
        recordedConnectors([mail.client]).connectors,
        approvals,
      );
      const service = serviceOn(fakeShell(), definitions, {
        setTimer: pageTimers,
        openRunConnectors: open,
      });

      const { id } = await service.startRun(reply, {});

      expect(await settle(await service.open(), id)).toBe("completed");
      expect(mail.calls).toEqual(["lookup"]);
      expect(heard).toEqual([]);
      await service.close();
    });

    it("keep a tool that isn't approved off, and say it waits", async () => {
      const definitions = writerWithMail();
      const mail = mailServer();
      const { open, heard } = runConnectors(
        definitions,
        recordedConnectors([mail.client]).connectors,
      );
      const service = serviceOn(fakeShell(), definitions, {
        setTimer: pageTimers,
        openRunConnectors: open,
      });

      const { id } = await service.startRun(reply, {});
      expect(await settle(await service.open(), id)).toBe("completed");
      expect(mail.calls).toEqual([]);
      expect(heard).toEqual([
        { connector: "mail", waiting: [expect.objectContaining({ name: "lookup" })] },
      ]);
      await service.close();
    });

    it("refuse, before the lock is taken, an agent with a connector that isn't `stdio`", async () => {
      const shell = fakeShell();
      const definitions = writerWithMail(
        "name: Mail\ntransport:\n  http:\n    url: https://mail.example.com/mcp\n",
      );
      const service = serviceOn(shell, definitions, {
        openRunConnectors: runConnectors(definitions, recordedConnectors().connectors).open,
      });

      await expect(service.check(reply)).rejects.toMatchObject({
        kind: "unavailable",
        message: 'writer uses the connector "mail", which Studio can\'t start yet.',
      });
      expect(lockCalls(shell)).toEqual([]);
    });

    it("close when the engine closes, before the lock is given back", async () => {
      const { connectors, log } = recordedConnectors();
      const shell = fakeShell();
      const closeAll = connectors.closeAll.bind(connectors);
      let heldAtClose: string[] = [];
      connectors.closeAll = async () => {
        heldAtClose = lockCalls(shell);
        await closeAll();
      };
      const definitions = acmeFiles();
      const service = serviceOn(shell, definitions, {
        openRunConnectors: runConnectors(definitions, connectors).open,
      });
      await service.open();

      await service.close();

      expect(log).toEqual(["close all"]);
      expect(heldAtClose).toEqual(["engine_lock_hold"]);
      expect(lockCalls(shell)).toEqual(["engine_lock_hold", "engine_lock_release"]);
    });

    it("are built once for each engine the service opens", async () => {
      const definitions = acmeFiles();
      const build = vi.fn(runConnectors(definitions, recordedConnectors().connectors).open);
      const service = serviceOn(fakeShell(), definitions, { openRunConnectors: build });

      await service.open();
      await service.open();
      await service.close();
      await service.open();

      expect(build).toHaveBeenCalledTimes(2);
      await service.close();
    });
  });
});
