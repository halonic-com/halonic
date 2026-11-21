import { MemoryDefinitionStore } from "@halonicjs/adapter-memory";
import { verifies } from "@halonicjs/testing-spec";
import { filesOf, loadWorkspace } from "@halonicjs/workspace";
import { describe, expect, it } from "vitest";
import { acmeFiles, fakeShell, serviceOn } from "./engine-service.testing.ts";
import type { EngineParts, StudioHarnessHost } from "./studio-harness-host.ts";

verifies("studio.engine-service", () => {
  describe("with an agent host", () => {
    const reply = { hubId: "support", workflowId: "reply" };
    const coder = acmeFiles({ writer: "harness: claude-code\n" });

    /** A harness host that records its start, and keeps the engine's parts it was given. */
    function fakeHarnessHost() {
      const started: ReadonlySet<string>[] = [];
      let decisions: EngineParts | undefined;
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
      const openHarnessHost = async (given: EngineParts) => {
        decisions = given;
        return host;
      };
      return {
        started,
        openHarnessHost,
        approvalsOf: (runId: string) => decisions?.approvalsOf(runId),
        remoteDecisionsOf: (runId: string) => decisions?.remoteDecisionsOf(runId),
        engine: () => decisions,
      };
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

    it("passes a routine's agent in a harness, then refuses it as `unavailable` while agent runs aren't built", async () => {
      const { openHarnessHost } = fakeHarnessHost();
      const service = serviceOn(fakeShell(), coder, { openHarnessHost });

      await expect(service.checkAgent({ hubId: "support", agentId: "writer" })).resolves.toBe(
        undefined,
      );
      await expect(
        service.startRoutine(
          { agent: { hubId: "support", agentId: "writer", prompt: "Go." } },
          { routineKey: "support/weekly", at: "2026-11-15T10:00:00.000Z" },
        ),
      ).rejects.toMatchObject({ kind: "unavailable" });
      await service.close();
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

    it("serves the engine's own decisions to a phone, which no question waits for yet", async () => {
      const harness = fakeHarnessHost();
      const service = serviceOn(fakeShell(), coder, { openHarnessHost: harness.openHarnessHost });
      await service.open();

      // No harness call is going on in the run, so a phone's decision finds no question.
      const remoteDecisions = harness.remoteDecisionsOf("run_1");
      await expect(
        remoteDecisions?.decide({ callId: "toolu_1", approved: true, source: "remote-device" }),
      ).resolves.toBe("unknown");
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

verifies("studio.harness-provider-key", () => {
  describe("the engine's parts for a sandboxed agent's key", () => {
    const coder = acmeFiles({ writer: "harness: claude-code\n" });
    const ownAddress = {
      version: 1,
      id: "zai",
      type: "anthropic",
      secret: "zai-key",
      baseUrl: "https://api.zai.acme.test/anthropic",
      local: false,
      options: {},
    } as const;

    /** Opens the engine on `isTrusted`, and gives the parts it handed the harness host. */
    async function partsWhen(isTrusted: boolean): Promise<EngineParts | undefined> {
      let given: EngineParts | undefined;
      const service = serviceOn(fakeShell(), coder, {
        isTrusted: async () => isTrusted,
        openHarnessHost: async (engine) => {
          given = engine;
          return {
            harnesses: {} as StudioHarnessHost["harnesses"],
            proposalFolders: {
              open: async () => "/p",
              folderOf: async () => null,
              end: async () => {},
            },
            start: async () => {},
          };
        },
      });
      await service.open();
      await service.close();
      return given;
    }

    it("gives the loaded workspace and the model calls' key check, bound to the workspace's trust", async () => {
      const trusted = await partsWhen(true);
      const untrusted = await partsWhen(false);

      const loaded = trusted?.workspace();
      const agents = loaded === undefined ? [] : filesOf(loaded, "agent");
      expect(agents.map((file) => file.value.id)).toContain("writer");
      await expect(trusted?.requireKeyMayGo(ownAddress)).resolves.toBeUndefined();
      await expect(untrusted?.requireKeyMayGo(ownAddress)).rejects.toMatchObject({
        message: expect.stringContaining("zai"),
      });
    });

    it("gives the model calls' alias check, bound to the workspace's trust", async () => {
      const trusted = await partsWhen(true);
      const untrusted = await partsWhen(false);
      const withAlias = await loadWorkspace(
        new MemoryDefinitionStore({
          "workspace.yaml": "id: acme\nname: Acme\n",
          "hubs/lab/hub.yaml": "id: lab\nname: Lab\n",
          "providers/zai.yaml": `id: zai\ntype: anthropic\nsecret: zai-key\nbaseUrl: ${ownAddress.baseUrl}\n`,
          "models.yaml": "aliases:\n  open-coder:\n    provider: zai\n    model: glm-5.3\n",
        }),
      );

      expect(trusted?.aliases.providerModel(withAlias, "lab", "open-coder")).toBe("glm-5.3");
      await expect(
        trusted?.aliases.access(withAlias, "lab", "open-coder", "claude-code"),
      ).resolves.toMatchObject({ providerId: "zai" });
      await expect(
        untrusted?.aliases.access(withAlias, "lab", "open-coder", "claude-code"),
      ).rejects.toThrow();
    });
  });
});
