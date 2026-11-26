import { verifies } from "@halonicjs/testing-spec";
import type { PluginApiRequestInput } from "@paperclipai/plugin-sdk";
import { describe, expect, test } from "vitest";
import type { ApiFetch } from "../seat-mover/api.ts";
import { handleSeatReset, type SeatResetRouteApi, seatResetsState } from "./seat-reset-route.ts";

const now = new Date("2026-11-26T10:00:00.000Z");
const heartbeat = { enabled: true, intervalSec: 3600 };
const onSeat = (seat: string) => ({
  heartbeat,
  aiConnection: { mode: "delegated", connectionId: `c-${seat}`, grantId: `g-${seat}` },
});

/** A fake Paperclip API: two seats, the agents' configs, and every write it was sent. */
function paperclip(
  configs: Map<string, Record<string, unknown>>,
  options: { refuse?: string } = {},
) {
  const writes: string[] = [];
  const answer = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
  const fetch: ApiFetch = async (url, init) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/ai-connections")) {
      const connection = (name: string) => ({
        id: `c-${name}`,
        grantId: `g-${name}`,
        method: "subscription",
        status: "connected",
      });
      return answer({ connections: [connection("One"), connection("Two")] });
    }
    if (path.endsWith("/data/seats")) {
      const seat = (name: string) => ({ name, connectionId: `c-${name}`, reading: null });
      return answer({ data: { seats: [seat("One"), seat("Two")] } });
    }
    const agentId = decodeURIComponent(path.split("/").at(-1) ?? "");
    if (init.method === "PATCH") {
      if (agentId === options.refuse) {
        return { ok: false, status: 409, json: async () => ({}) };
      }
      const { runtimeConfig } = JSON.parse(init.body ?? "{}") as {
        runtimeConfig: Record<string, unknown>;
      };
      writes.push(`${agentId} ${JSON.stringify(runtimeConfig["halonicLimitReset"])}`);
      configs.set(agentId, runtimeConfig);
      return answer({});
    }
    return answer({ runtimeConfig: configs.get(agentId) });
  };
  return { fetch, writes };
}

function context(agents: { id: string; name: string; seat: string }[]) {
  const state = new Map<string, unknown>();
  const comments: string[] = [];
  const ctx: SeatResetRouteApi = {
    config: {
      get: async () => ({
        paperclipApiUrl: "http://paperclip.test",
        paperclipApiKey: { type: "secret_ref", secretId: "board-key-ref" },
        seatMover: { readingsPlugin: "readings", logTask: "HAL-16116" },
      }),
    },
    secrets: { resolve: async () => "board-key" },
    agents: {
      list: async () =>
        agents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          status: "idle",
          runtimeConfig: onSeat(agent.seat),
        })) as never,
    },
    issues: {
      get: async (task) => ({ id: `id-${task}` }) as never,
      createComment: async (_issueId, body) => {
        comments.push(body);
        return {} as never;
      },
    },
    state: {
      get: async (key) => state.get(key.stateKey),
      set: async (key, value) => {
        state.set(key.stateKey, value);
      },
    },
    logger: { info: () => undefined, error: () => undefined },
  };
  return { ctx, comments };
}

function request(body: unknown, actor: Partial<PluginApiRequestInput["actor"]> = {}) {
  return {
    routeKey: "seat-reset",
    method: "POST",
    path: "/seat-mover/seat-reset",
    params: {},
    query: { companyId: "co" },
    body,
    actor: { actorType: "user", actorId: "board", userId: "board", ...actor },
    companyId: "co",
    headers: {},
  } as PluginApiRequestInput;
}

const team = [
  { id: "a-kim", name: "Kim", seat: "One" },
  { id: "a-iris", name: "Iris", seat: "One" },
  { id: "a-leo", name: "Leo", seat: "Two" },
];

verifies("paperclip.seat-mover-reset", () => {
  describe("seat-reset route", () => {
    test("marks every agent on the seat, keeps their heartbeat, and remembers the reset", async () => {
      const configs = new Map(team.map((agent) => [agent.id, onSeat(agent.seat)]));
      const api = paperclip(configs);
      const { ctx, comments } = context(team);
      const answer = await handleSeatReset(request({ seat: "one" }), ctx, api.fetch, now);
      const mark = JSON.stringify({ connectionId: "c-One", at: now.toISOString() });
      expect(answer).toEqual({
        status: 200,
        body: {
          seat: "One",
          connectionId: "c-One",
          at: now.toISOString(),
          agents: [
            { name: "Kim", outcome: "marked" },
            { name: "Iris", outcome: "marked" },
          ],
        },
      });
      expect(api.writes).toEqual([`a-kim ${mark}`, `a-iris ${mark}`]);
      expect(configs.get("a-kim")).toEqual({
        ...onSeat("One"),
        halonicLimitReset: { connectionId: "c-One", at: now.toISOString() },
      });
      expect(configs.get("a-leo")).toEqual(onSeat("Two"));
      expect(await seatResetsState(ctx.state, "co").get()).toEqual({ "c-One": now.toISOString() });
      expect(comments).toEqual(["Seat mover: the board reset the One seat; marked Kim, Iris."]);
    });

    test("takes a connection id, leaves an agent moved off since the list, and goes on after a failure", async () => {
      const configs = new Map(team.map((agent) => [agent.id, onSeat(agent.seat)]));
      configs.set("a-kim", onSeat("Two"));
      const api = paperclip(configs, { refuse: "a-iris" });
      const answer = await handleSeatReset(
        request({ seat: "c-One" }),
        context(team).ctx,
        api.fetch,
        now,
      );
      expect(answer.body).toMatchObject({
        agents: [
          { name: "Kim", outcome: "skipped-moved" },
          { name: "Iris", outcome: "failed" },
        ],
      });
      expect(api.writes).toEqual([]);
    });

    test("refuses anyone but the board, a missing seat and an unknown seat", async () => {
      const api = paperclip(new Map());
      const { ctx } = context(team);
      const agent = { actorType: "agent", userId: null, agentId: "a-kim" } as const;
      expect(
        (await handleSeatReset(request({ seat: "One" }, agent), ctx, api.fetch, now)).status,
      ).toBe(403);
      expect((await handleSeatReset(request({}), ctx, api.fetch, now)).status).toBe(400);
      expect((await handleSeatReset(request({ seat: "Admin" }), ctx, api.fetch, now)).status).toBe(
        404,
      );
      expect(api.writes).toEqual([]);
    });

    test("forgets resets older than six hours when it keeps a new one", async () => {
      const { ctx } = context(team);
      const resets = seatResetsState(ctx.state, "co");
      await resets.set({
        "c-Old": "2026-11-26T03:00:00.000Z",
        "c-Two": "2026-11-26T09:00:00.000Z",
      });
      await handleSeatReset(request({ seat: "One" }), ctx, paperclip(new Map()).fetch, now);
      expect(await resets.get()).toEqual({
        "c-Two": "2026-11-26T09:00:00.000Z",
        "c-One": now.toISOString(),
      });
    });
  });
});
