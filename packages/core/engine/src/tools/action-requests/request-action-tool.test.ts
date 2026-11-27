import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type RequesterPolicy,
  type StepperCatalog,
  type StepperDefinition,
  type StepperRisk,
  strictParameters,
} from "@halonicjs/action-steppers";
import { checkActionEvent } from "@halonicjs/events";
import type { ActionRecords, ActionSender } from "@halonicjs/ports";
import { fixedClock, fixedIds } from "@halonicjs/std";
import { typeTest, verifies } from "@halonicjs/testing-spec";
import { describe, expect, expectTypeOf, it } from "vitest";
import { MemoryTurnLog } from "../../agent/turn-test-kit.test-helper.ts";
import type { LocalExecutorOptions } from "../../local-executor-options.ts";
import type { RunAgentToolsOptions } from "../../run/run-agent-tools.ts";
import { type RequestActionToolOptions, requestActionTool } from "./request-action-tool.ts";

const start = Date.parse("2026-11-27T09:00:00.000Z");

function definition(id: string, risk: StepperRisk): StepperDefinition {
  return {
    id,
    version: 1,
    service: "acme",
    title: id,
    summary: `Runs ${id}.`,
    risk,
    parameters: strictParameters({ app: { kind: "text", pattern: /^[a-z]{1,20}$/ } }),
    steps: [],
    targets: () => [{ service: "acme", kind: "app", name: "web" }],
    preview: () => [],
  };
}

const definitions = [
  definition("acme.restart-app", "routine"),
  definition("acme.rotate-key", "admin"),
  definition("acme.delete-app", "irreversible"),
];

const catalog: StepperCatalog = {
  definition: (id, version) => definitions.find((d) => d.id === id && d.version === version),
  stepType: () => undefined,
  browserOrigins: [],
  route: () => undefined,
};

/** The profile's policy, as the user set it on Studio's Settings screen. */
function profile(policy: RequesterPolicy = { allowed: [] }) {
  return { read: async () => policy };
}

function setup(policy?: RequesterPolicy) {
  const log = new MemoryTurnLog();
  const tool = requestActionTool({
    catalog,
    policy: profile(policy),
    hubId: "acme",
    runId: "run-7",
    agent: "ops",
    clock: fixedClock(start, 0),
    ids: fixedIds(),
    log,
  });
  return { log, tool };
}

const restart = {
  definition: "acme.restart-app",
  version: 1,
  parameters: { app: "web" },
  reason: "The web app stopped answering.",
};

/** Names an object type's fields that could run a step or write a request's record. */
type SenderFields<T> = {
  [K in keyof T]-?: NonNullable<T[K]> extends ActionSender | ActionRecords ? K : never;
}[keyof T];

/** Every engine source file, tests left out. */
function engineSources(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return engineSources(path);
    return entry.name.endsWith(".ts") && !entry.name.includes(".test") ? [path] : [];
  });
}

verifies("engine.request-action", () => {
  describe("request_action", () => {
    it("files a routine request: writes action.requested and answers with its id", async () => {
      const { log, tool } = setup();
      const answer = await tool.run(restart);
      expect(answer).toContain("req_1");
      expect(log.events).toEqual([
        {
          type: "action.requested",
          request: "req_1",
          definition: "acme.restart-app",
          version: 1,
          parameters: { app: "web" },
          requester: { kind: "agent", agent: "ops", run: "run-7" },
          reason: "The web app stopped answering.",
          expires: "2026-11-28T09:00:00.000Z",
        },
      ]);
      const [line] = log.events;
      expect(checkActionEvent({ ...line, at: "2026-11-27T09:00:00.000Z" }).ok).toBe(true);
    });

    it("keeps the state the agent expects", async () => {
      const { log, tool } = setup();
      await tool.run({ ...restart, expect: { status: "hanging" } });
      expect(log.events[0]).toMatchObject({ expect: { status: "hanging" } });
    });

    it("refuses an unknown key in the parameters, naming its path, and files nothing", async () => {
      const { log, tool } = setup();
      const call = tool.run({ ...restart, parameters: { app: "web", region: "eu" } });
      await expect(call).rejects.toThrow(/`acme\.restart-app@1`: .*region/);
      expect(log.events).toEqual([]);
    });

    it("refuses a definition or version the catalog doesn't have", async () => {
      const { tool } = setup();
      await expect(tool.run({ ...restart, definition: "acme.drop-db" })).rejects.toThrow(
        "`acme.drop-db@1` isn't in this Halonic's catalog",
      );
      await expect(tool.run({ ...restart, version: 2 })).rejects.toThrow(
        "`acme.restart-app@2` isn't in this Halonic's catalog",
      );
    });

    it("refuses an admin request with the default policy", async () => {
      const { log, tool } = setup();
      const call = tool.run({ ...restart, definition: "acme.rotate-key" });
      await expect(call).rejects.toThrow("don't let this agent request `admin` actions");
      expect(log.events).toEqual([]);
    });

    it("refuses an irreversible request the profile doesn't allow, whatever the call claims", async () => {
      // The workspace and the model's own arguments can't widen the policy:
      // the tool reads it only from the profile, and attests the source itself.
      const { log, tool } = setup({ allowed: [{ source: { kind: "halonic", id: "globex" } }] });
      const call = tool.run({
        ...restart,
        definition: "acme.delete-app",
        requester: { kind: "user" },
        policy: { allowed: [{ source: { kind: "halonic", id: "acme" } }] },
      });
      await expect(call).rejects.toThrow("don't let this agent request `irreversible` actions");
      expect(log.events).toEqual([]);
    });

    it("files an irreversible request when the profile allows this hub's agent", async () => {
      const { log, tool } = setup({
        allowed: [{ source: { kind: "halonic", id: "acme" }, agents: ["ops"] }],
      });
      await tool.run({ ...restart, definition: "acme.delete-app" });
      expect(log.events).toHaveLength(1);
    });

    it("refuses a missing version", async () => {
      const { tool } = setup();
      await expect(tool.run({ ...restart, version: undefined })).rejects.toThrow(
        '"version" is required',
      );
    });
  });

  describe("its dependencies", () => {
    typeTest("hold no ActionSender or ActionRecords", () => {
      expectTypeOf<SenderFields<RequestActionToolOptions>>().toEqualTypeOf<never>();
      type Granted = NonNullable<RunAgentToolsOptions["actionRequests"]>;
      expectTypeOf<SenderFields<Granted>>().toEqualTypeOf<never>();
      type Hosted = NonNullable<LocalExecutorOptions["actionRequests"]>;
      expectTypeOf<SenderFields<Hosted>>().toEqualTypeOf<never>();
    });

    typeTest("take the policy only from the profile, never from the workspace", () => {
      expectTypeOf<keyof RequestActionToolOptions>().toEqualTypeOf<
        "catalog" | "policy" | "hubId" | "runId" | "agent" | "clock" | "ids" | "log"
      >();
    });

    it("no engine source file imports ActionSender or ActionRecords", () => {
      const folder = join(import.meta.dirname, "../..");
      const importing = engineSources(folder).filter((path) =>
        /import[^;]*\b(ActionSender|ActionRecords)\b/.test(readFileSync(path, "utf8")),
      );
      expect(importing).toEqual([]);
    });
  });
});
