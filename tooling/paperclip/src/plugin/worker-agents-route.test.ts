import { readFile } from "node:fs/promises";
import { verifies } from "@halonicjs/testing-spec";
import type { PluginApiRequestInput } from "@paperclipai/plugin-sdk";
import { expect, test } from "vitest";
import { workerAgentsDataKey } from "../worker-agents/keys.ts";
import type { WorkerTables } from "../worker-agents/tables.ts";
import { manifest } from "./manifest.ts";
import {
  handleWorkerAgentsRequest,
  registerWorkerAgentsData,
  type WorkerAgentsDeps,
} from "./worker-agents-route.ts";

// Made-up company, agents and tasks only.
function setup() {
  const reads: string[] = [];
  const read =
    <T>(name: string, rows: T[]) =>
    async () => {
      reads.push(name);
      return rows;
    };
  const tables: WorkerTables = {
    tasksInProgress: read("tasks", []),
    lastRuns: read("runs", []),
    failedRunsSince: read("failed", []),
  };
  const deps: WorkerAgentsDeps = {
    agents: read("agents", [{ id: "a1", name: "Ravi", urlKey: "ravi", status: "idle" }]),
    tables,
    now: () => new Date("2026-11-23T14:20:00.000Z"),
  };
  return { deps, reads };
}

function request(actor: object): PluginApiRequestInput {
  return {
    routeKey: "worker-agents",
    method: "GET",
    path: "/worker-agents",
    params: {},
    query: { companyId: "acme" },
    body: undefined,
    headers: {},
    companyId: "acme",
    actor,
  } as unknown as PluginApiRequestInput;
}

const board = { actorType: "user", actorId: "user-1", userId: "user-1" };
const agent = { actorType: "agent", actorId: "a1", agentId: "a1", runId: "run-1" };
const noUser = { actorType: "user", actorId: "", userId: "" };

verifies("paperclip.worker-agents-page", () => {
  test("the manifest declares the page's route board-only, and no agent tool for it", () => {
    const route = manifest.apiRoutes?.find((candidate) => candidate.routeKey === "worker-agents");
    expect(route).toMatchObject({ method: "GET", auth: "board" });
    expect(
      manifest.tools?.map((tool) => tool.name).filter((name) => /worker|agents/.test(name)),
    ).toEqual([]);
    expect(manifest.ui?.slots?.map((slot) => [slot.type, slot.exportName])).toEqual([
      ["page", "WorkerAgentsPage"],
    ]);
  });

  test("an agent's key, or a caller without a signed-in user, gets nothing and reads nothing", async () => {
    for (const caller of [agent, noUser]) {
      const { deps, reads } = setup();
      const response = await handleWorkerAgentsRequest(request(caller), deps);
      expect(response.status).toBe(403);
      expect(JSON.stringify(response.body)).not.toContain("Ravi");
      expect(reads).toEqual([]);
    }
  });

  test("a board user gets the page", async () => {
    const { deps } = setup();
    const response = await handleWorkerAgentsRequest(request(board), deps);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      at: "2026-11-23T14:20:00.000Z",
      agents: [{ name: "Ravi" }],
    });
  });

  test("the page's data key answers for the company Paperclip checked, and needs one", async () => {
    const { deps } = setup();
    const handlers = new Map<string, (params: Record<string, unknown>) => Promise<unknown>>();
    registerWorkerAgentsData(
      { data: { register: (key, handler) => handlers.set(key, handler) } },
      deps,
    );
    const handler = handlers.get(workerAgentsDataKey);
    await expect(handler?.({ companyId: "acme" })).resolves.toMatchObject({
      agents: [{ name: "Ravi" }],
    });
    await expect(handler?.({})).rejects.toThrow("needs a company");
  });

  test("the page's code only reads: no action, request or navigation call", async () => {
    const source = await readFile(
      new URL("../worker-agents/ui/index.tsx", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(
      /usePluginAction|ActionBar|fetch\(|XMLHttpRequest|method:|<form|useHostNavigation/,
    );
    expect([...source.matchAll(/use[A-Z]\w+/g)].map((match) => match[0])).toEqual([
      "usePluginData",
      "usePluginData",
    ]);
  });
});
