import type { AgentMessaging } from "@halonicjs/ports";
import { FakeAgentMessaging, FakeTeamStatus } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it, vi } from "vitest";
import { agentsBySpendShown, TeamDetails } from "./team-details.ts";

const now = new Date("2026-11-24T13:00:00.000Z");
const clock = { now: () => now };
const usd = (dollars: number) => ({ cents: Math.round(dollars * 100), currency: "USD" });

/** An Acme team: a TeamStatus source and a messaging source whose agents share their IDs. */
function acme() {
  const team = new FakeTeamStatus({ now: () => now });
  const { source } = team.addSource();
  const messaging = new FakeAgentMessaging({ now: () => now });
  const { id: chat } = messaging.addSource({ label: "Acme" });
  const addAgent = (name: string, activity: "idle" | "working" = "idle") =>
    messaging.addAgent(chat, { id: `agent-${name}`, name, activity }).id;
  return { team, source, messaging, chat, addAgent };
}

verifies("team.agent-and-seat-detail", () => {
  describe("TeamDetails.agentsBySpend", () => {
    it("lists the five that paid most today, and all of them for See all", async () => {
      const { team, source, messaging, addAgent } = acme();
      for (const [index, name] of ["Ada", "Ben", "Cy", "Di", "Ed", "Fay", "Gus"].entries()) {
        team.addAgentSpend(source, { agent: addAgent(name), range: "today", paid: usd(index) });
      }
      const details = new TeamDetails(team, messaging, clock);
      const top = await details.agentsBySpend(agentsBySpendShown);
      expect(top.total).toBe(7);
      expect(top.rows.map((row) => row.agent.name)).toEqual(["Gus", "Fay", "Ed", "Di", "Cy"]);
      expect((await details.agentsBySpend()).rows).toHaveLength(7);
    });

    it("puts the agent that used more tokens first when neither paid", async () => {
      const { team, source, messaging, addAgent } = acme();
      const tokens = (output: number) => ({ input: 0, cached: 0, output });
      team.addAgentSpend(source, { agent: addAgent("Kim"), range: "today", tokens: tokens(10) });
      team.addAgentSpend(source, { agent: addAgent("Owen"), range: "today", tokens: tokens(90) });
      const { rows } = await new TeamDetails(team, messaging, clock).agentsBySpend();
      expect(rows.map((row) => row.agent.name)).toEqual(["Owen", "Kim"]);
    });

    it("gives each row the seat its agent is on", async () => {
      const { team, source, messaging, addAgent } = acme();
      const kim = addAgent("Kim");
      team.addAgentSpend(source, { agent: kim, range: "today", paid: usd(3) });
      team.addSeat(source, { label: "Seat A", agents: [kim] });
      const { rows } = await new TeamDetails(team, messaging, clock).agentsBySpend();
      expect(rows[0]?.seat?.label).toBe("Seat A");
    });
  });

  describe("TeamDetails.agentsByRange", () => {
    it("gives every agent's spend in each range, most paid in the picked range first", async () => {
      const { team, source, messaging, addAgent } = acme();
      const kim = addAgent("Kim");
      const owen = addAgent("Owen");
      const ada = addAgent("Ada");
      team.addAgentSpend(source, { agent: kim, range: "today", paid: usd(9) });
      team.addAgentSpend(source, { agent: owen, range: "today", paid: usd(4) });
      team.addAgentSpend(source, { agent: owen, range: "week", paid: usd(80) });
      team.addAgentSpend(source, { agent: ada, range: "month", paid: usd(500) });
      const details = new TeamDetails(team, messaging, clock);
      const today = await details.agentsByRange("today");
      expect(today.map((row) => row.agent.name)).toEqual(["Kim", "Owen", "Ada"]);
      expect(today[1]?.spend.week?.paid.cents).toBe(8000);
      const week = await details.agentsByRange("week");
      expect(week[0]?.agent.name).toBe("Owen");
      expect(await new TeamDetails(undefined, messaging, clock).agentsByRange("today")).toEqual([]);
    });
  });

  describe("TeamDetails.agent", () => {
    it("gives the agent's spend by range, its seat and the task it works on", async () => {
      const { team, source, messaging, chat, addAgent } = acme();
      const mateo = addAgent("Mateo", "working");
      messaging.addWork(chat, {
        label: "HAL-17508",
        title: "Seat page",
        assignee: mateo,
        state: "in-progress",
      });
      team.addAgentSpend(source, { agent: mateo, range: "today", paid: usd(8.4) });
      team.addAgentSpend(source, { agent: mateo, range: "week", paid: usd(61.3) });
      team.addAgentSpend(source, { agent: mateo, range: "month", paid: usd(402.1) });
      team.addSeat(source, { label: "Seat B", agents: [mateo] });
      const detail = await new TeamDetails(team, messaging, clock).agent(mateo);
      expect(detail?.agent).toMatchObject({ name: "Mateo", activity: "working" });
      expect(detail?.agent.work?.label).toBe("HAL-17508");
      expect(detail?.spend.today?.paid.cents).toBe(840);
      expect(detail?.spend.week?.paid.cents).toBe(6130);
      expect(detail?.spend.month?.paid.cents).toBe(40210);
      expect(detail?.seat?.label).toBe("Seat B");
    });

    it("still gives the spend when messaging fails, and logs the failure", async () => {
      const { team, source } = acme();
      team.addAgentSpend(source, { agent: "agent-Mateo", range: "today", paid: usd(8.4) });
      const failing = new FakeAgentMessaging({ now: () => now }) as AgentMessaging;
      failing.listAgents = () => Promise.reject(new Error("offline"));
      const logged = vi.spyOn(console, "error").mockImplementation(() => {});
      const detail = await new TeamDetails(team, failing, clock).agent("agent-Mateo");
      expect(detail?.agent.name).toBeUndefined();
      expect(detail?.spend.today?.paid.cents).toBe(840);
      expect(logged).toHaveBeenCalledOnce();
      logged.mockRestore();
    });

    it("gives nothing for an agent no source knows, or without TeamStatus", async () => {
      const { team, messaging } = acme();
      expect(await new TeamDetails(team, messaging, clock).agent("agent-Nobody")).toBeUndefined();
      expect(await new TeamDetails(undefined, messaging, clock).agent("x")).toBeUndefined();
    });
  });

  describe("TeamDetails.seat", () => {
    it("gives the seat with its agents' status and task, and its proposal", async () => {
      const { team, source, messaging, chat, addAgent } = acme();
      const owen = addAgent("Owen", "working");
      const kim = addAgent("Kim");
      messaging.addWork(chat, {
        label: "HAL-17500",
        title: "x",
        assignee: owen,
        state: "in-progress",
      });
      const proposal = { text: "Move Owen and Kim to Seat C", at: "2026-11-24T12:55:00.000Z" };
      const seat = team.addSeat(source, { label: "Seat B", agents: [owen, kim], proposal });
      const detail = await new TeamDetails(team, messaging, clock).seat(seat.id);
      expect(detail?.seat.proposal).toEqual(proposal);
      expect(
        detail?.agents.map((agent) => [agent.name, agent.activity, agent.work?.label]),
      ).toEqual([
        ["Owen", "working", "HAL-17500"],
        ["Kim", "idle", undefined],
      ]);
      expect(await new TeamDetails(team, messaging, clock).seat("no-such-seat")).toBeUndefined();
    });
  });
});
