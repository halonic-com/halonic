import type { RunEvent, RunSummary } from "@halonicjs/events";
import type { RunExecutor } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import type { WorkspaceInfo } from "./api.ts";
import { createRunRoutes } from "./run-routes.ts";
import type { WaitFacts } from "./wait-context.ts";

const mail = "Hi, my order #1042 arrived damaged. Can I get a refund? — Sam (invented)";
// Acme's `review` step as `support-reply.workflow.yaml` writes it.
const description =
  "Approve this reply?\n{{context.reply}}\n\nApproving finishes the run. Nothing is sent.";

/** A run of Acme's Support reply, waiting at `review`. */
function waiting(id: string, workflowId = "support-reply"): RunSummary {
  return {
    id,
    hubId: "acme",
    workflowId,
    status: "waiting",
    state: "review",
    approvals: [],
  } as unknown as RunSummary;
}

/** The log of a run started with `mail`, whose one model call went to `provider`. */
function logOf(runId: string, provider: string): RunEvent[] {
  const at = "2026-11-26T07:20:00.000Z";
  return [
    {
      type: "run.started",
      hubId: "acme",
      workflowId: "support-reply",
      input: { mail },
      kind: "run",
      definitionsVersion: "v1",
      runId,
      seq: 1,
      at,
    },
    {
      type: "llm.request",
      agent: "writer",
      provider,
      model: "echo",
      messages: 2,
      runId,
      seq: 2,
      at,
    },
  ];
}

const acme: WaitFacts = {
  workflow: (hubId, workflowId) =>
    hubId === "acme" && workflowId === "support-reply"
      ? {
          name: "Support reply",
          startField: "mail",
          stepDescription: (stateId) => (stateId === "review" ? description : undefined),
        }
      : undefined,
  isTestModel: (providerId) => providerId === "mock",
};

function routes(options: {
  stored: RunSummary[];
  waitFacts?: () => Promise<WaitFacts>;
  events?: (runId: string) => Promise<RunEvent[]>;
}) {
  const logged: unknown[] = [];
  const workspace: WorkspaceInfo = {
    describe: async () => ({ name: "Acme", sample: false, folder: "acme", home: null }),
    ...(options.waitFacts === undefined ? {} : { waitFacts: options.waitFacts }),
  };
  const created = createRunRoutes({
    runs: {} as RunExecutor,
    runStore: {
      list: async () => options.stored,
      get: async () => null,
      ...(options.events === undefined ? {} : { events: options.events }),
    },
    trust: { check: async () => ({ state: "trusted", message: "Trusted." }) },
    errorLog: { record: (error) => logged.push(error) },
    workspace,
  });
  return { routes: created, logged };
}

async function listed(created: ReturnType<typeof routes>["routes"]) {
  return (await (await created.waiting()).json()) as {
    runs: unknown[];
    agents: unknown;
    context?: Record<string, unknown>;
  };
}

describe("the waiting list's context", () => {
  verifies("server.waiting-run-context", () => {
    it("says each run's workflow, waiting step, start input and whether it ran on the test model", async () => {
      const { routes: created } = routes({
        stored: [waiting("r2"), waiting("r3")],
        waitFacts: async () => acme,
        events: async (runId) => logOf(runId, runId === "r2" ? "mock" : "openai"),
      });
      const body = await listed(created);
      expect(body.runs).toHaveLength(2);
      expect(body.context).toEqual({
        r2: { workflow: "Support reply", description, startInput: mail, sample: true },
        r3: { workflow: "Support reply", description, startInput: mail, sample: false },
      });
    });

    it("names a workflow the workspace no longer has by its id, with no step or input", async () => {
      const { routes: created } = routes({
        stored: [waiting("r4", "old-reply")],
        waitFacts: async () => acme,
        events: async (runId) => logOf(runId, "mock"),
      });
      expect((await listed(created)).context).toEqual({
        r4: { workflow: "old-reply", sample: true },
      });
    });

    it("still lists the runs when the facts or a log can't be read, and logs why", async () => {
      const broken = new Error("workflows/support-reply.workflow.yaml is not valid YAML");
      const unreadable = routes({
        stored: [waiting("r2")],
        waitFacts: async () => {
          throw broken;
        },
        events: async (runId) => logOf(runId, "mock"),
      });
      const body = await listed(unreadable.routes);
      expect(body.runs).toHaveLength(1);
      expect(body.context).toEqual({});
      expect(unreadable.logged).toEqual([broken]);

      const damaged = new Error("r2.jsonl line 3 is not JSON");
      const oneLog = routes({
        stored: [waiting("r2"), waiting("r3")],
        waitFacts: async () => acme,
        events: async (runId) => {
          if (runId === "r2") throw damaged;
          return logOf(runId, "mock");
        },
      });
      expect(Object.keys((await listed(oneLog.routes)).context ?? {})).toEqual(["r3"]);
      expect(oneLog.logged).toEqual([damaged]);
    });

    it("gives no context when the host doesn't give its workflows", async () => {
      const { routes: created } = routes({ stored: [waiting("r2")] });
      expect(await listed(created)).toEqual({ runs: [waiting("r2")], agents: {} });
    });
  });
});
