import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { AgentsHostService, alreadyHandsWork, handOffPath } from "./api.ts";
import { memoryAgentsHost } from "./memory-host.ts";

const acme = { id: "acme", name: "Acme" };
const refundChecker = { hubId: "acme", id: "refund-checker", name: "Refund checker" };

verifies("agents.host", () => {
  it("is named so the app and the feature find the same service", () => {
    expect(AgentsHostService.name).toBe("agents.host");
  });

  it("lists agents and names them at once", async () => {
    const host = memoryAgentsHost({ hubs: [acme], agents: [refundChecker] });
    expect(await host.list()).toEqual([refundChecker]);
    expect(await host.read(refundChecker)).toEqual(refundChecker);
    expect(host.nameOf(refundChecker)).toBe("Refund checker");
  });

  it("gives the workflows that run an agent, or none", async () => {
    const reply = { hubId: "acme", id: "reply", name: "Reply", steps: 1 };
    const host = memoryAgentsHost({
      hubs: [acme],
      agents: [refundChecker, { hubId: "acme", id: "triage", name: "Triage" }],
      users: { "acme/refund-checker": [reply] },
    });
    expect(await host.referencesTo(refundChecker)).toEqual([reply]);
    expect(await host.referencesTo({ hubId: "acme", id: "triage" })).toEqual([]);
  });

  it("rejects with not_found for an agent that isn't there", async () => {
    const host = memoryAgentsHost({ hubs: [acme] });
    const ghost = { hubId: "acme", id: "ghost" };
    await expect(host.read(ghost)).rejects.toBeInstanceOf(KindedError);
    await expect(host.read(ghost)).rejects.toMatchObject({ kind: "not_found" });
    await expect(host.referencesTo(ghost)).rejects.toMatchObject({ kind: "not_found" });
    expect(host.nameOf(ghost)).toBeUndefined();
  });

  it("takes the id from the name, adds -2 when it is taken, and tells its listeners", async () => {
    const host = memoryAgentsHost({ hubs: [acme], agents: [refundChecker] });
    let told = 0;
    host.subscribe(() => told++);
    const made = await host.create({ name: "Refund checker", hubId: "acme" });
    expect(made).toEqual({ hubId: "acme", id: "refund-checker-2" });
    expect(host.nameOf(made)).toBe("Refund checker");
    expect(told).toBe(1);
  });

  it("rejects creating in a hub that isn't there, as the real host does", async () => {
    const host = memoryAgentsHost({ hubs: [acme] });
    await expect(host.create({ name: "Triage", hubId: "ghost" })).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("stops telling a listener that unsubscribed", async () => {
    const host = memoryAgentsHost({ hubs: [acme] });
    let told = 0;
    const stop = host.subscribe(() => told++);
    stop();
    await host.create({ name: "Triage", hubId: "acme" });
    expect(told).toBe(0);
  });

  it("changes the fields it is given, tells listeners, and refuses an empty name", async () => {
    const host = memoryAgentsHost({ hubs: [acme], agents: [refundChecker] });
    let heard = 0;
    host.subscribe(() => (heard += 1));
    await host.update(refundChecker, { instructions: "Check the refund.", name: "Refunds" });
    expect(await host.settings(refundChecker)).toMatchObject({
      name: "Refunds",
      instructions: "Check the refund.",
    });
    expect(host.nameOf(refundChecker)).toBe("Refunds");
    expect(heard).toBe(1);
    await expect(host.update(refundChecker, { name: "  " })).rejects.toMatchObject({
      kind: "invalid_input",
    });
    await expect(host.update({ hubId: "acme", id: "ghost" }, {})).rejects.toMatchObject({
      kind: "not_found",
    });
  });

  it("gives the hub's team by name, and refuses a subagent that closes a loop", async () => {
    const agent = (id: string, name: string, subagents: string[] = []) => ({
      hubId: "acme",
      id,
      name,
      subagents,
    });
    const host = memoryAgentsHost({
      hubs: [acme],
      agents: [
        agent("triage", "Mail triage"),
        agent("writer", "Writer", ["triage"]),
        agent("sorter", "Sorter", ["writer"]),
      ],
    });
    const triage = { hubId: "acme", id: "triage" };
    expect((await host.team(triage)).map((member) => member.name)).toEqual([
      "Mail triage",
      "Sorter",
      "Writer",
    ]);
    await expect(host.update(triage, { subagents: ["sorter"] })).rejects.toMatchObject({
      kind: "conflict",
      message: "Sorter already hands work to Mail triage through Writer; that would be a loop.",
    });
    expect((await host.settings(triage)).subagents).toEqual([]);
    await expect(host.team({ hubId: "acme", id: "ghost" })).rejects.toMatchObject({
      kind: "not_found",
    });
  });
});

verifies("agents.host", () => {
  it("adds an agent step with an id from its name, and refuses one without instructions", async () => {
    const host = memoryAgentsHost({ hubs: [acme], agents: [refundChecker] });
    expect(
      await host.addAgentStep(refundChecker, { name: "Check refund", instructions: "Look." }),
    ).toBe("check-refund");
    expect(
      await host.addAgentStep(refundChecker, { name: "Check refund", instructions: "Again." }),
    ).toBe("check-refund-2");
    expect((await host.settings(refundChecker)).agentSteps.map((step) => step.id)).toEqual([
      "check-refund",
      "check-refund-2",
    ]);
    await expect(
      host.addAgentStep(refundChecker, { name: "Empty", instructions: "" }),
    ).rejects.toMatchObject({ kind: "invalid_input" });
  });
});

verifies("agents.host", () => {
  const member = (id: string, subagents: string[] = []) => ({
    hubId: "acme",
    id,
    name: id,
    subagents,
  });

  it("finds the shortest way work goes from one agent to another, or none", () => {
    const team = [member("a", ["b", "c"]), member("b", ["c"]), member("c", ["d"]), member("d")];
    expect(handOffPath(team, "a", "d")).toEqual(["a", "c", "d"]);
    expect(handOffPath(team, "a", "a")).toEqual(["a"]);
    expect(handOffPath(team, "d", "a")).toBeUndefined();
    expect(handOffPath([member("a", ["b"]), member("b", ["a"])], "a", "x")).toBeUndefined();
  });

  it("says who already hands work to whom, and through whom", () => {
    expect(alreadyHandsWork(["Sorter", "Mail triage"])).toBe(
      "Sorter already hands work to Mail triage",
    );
    expect(alreadyHandsWork(["Sorter", "Writer", "Mail triage"])).toBe(
      "Sorter already hands work to Mail triage through Writer",
    );
    expect(alreadyHandsWork(["A", "B", "C", "D"])).toBe(
      "A already hands work to D through B and C",
    );
    expect(alreadyHandsWork(["A", "B", "C", "D", "E"])).toBe(
      "A already hands work to E through B, C and D",
    );
  });
});
