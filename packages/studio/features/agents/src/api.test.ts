import { KindedError } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { AgentsHostService } from "./api.ts";
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
});

verifies("agents.host-chat", () => {
  const messages = [{ role: "user", content: "Sort this mail" }] as const;

  it("answers a Try it message, telling the listener each message", async () => {
    const host = memoryAgentsHost({ hubs: [acme], agents: [refundChecker] });
    const heard: unknown[] = [];
    const answer = await host.answer(refundChecker, {
      messages,
      listener: { onMessage: (message) => heard.push(message) },
    });
    expect(answer.end).toEqual({ reason: "answered" });
    expect(answer.messages).toEqual([{ role: "assistant", content: "Done." }]);
    expect(heard).toEqual(answer.messages);
  });

  it("answers the way a test gives it, with the conversation and the Stop signal", async () => {
    const stop = new AbortController();
    const host = memoryAgentsHost({
      hubs: [acme],
      agents: [refundChecker],
      answer: async (_ref, request) => {
        expect(request.messages).toEqual(messages);
        expect(request.signal).toBe(stop.signal);
        return { messages: [], end: { reason: "stopped", toolsRan: false } };
      },
    });
    const answer = await host.answer(refundChecker, { messages, signal: stop.signal });
    expect(answer.end).toEqual({ reason: "stopped", toolsRan: false });
  });

  it("rejects with not_found for an agent that isn't there", async () => {
    const host = memoryAgentsHost({ hubs: [acme] });
    await expect(host.answer({ hubId: "acme", id: "ghost" }, { messages })).rejects.toMatchObject({
      kind: "not_found",
    });
  });
});
