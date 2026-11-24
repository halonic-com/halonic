import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import type { AgentConnection, SignInChallenge } from "./agent-connections.ts";
import { AgentConnectionsService } from "./agent-connections.ts";
import { FakeAgentConnections } from "./fake-agent-connections.ts";
import {
  FakeAgentConnections as fakeFromIndex,
  AgentConnectionsService as fromIndex,
} from "./index.ts";

const startedAt = Date.parse("2026-11-24T14:00:00.000Z");
const halonic: AgentConnection = {
  id: "paperclip:halonic",
  provider: "paperclip",
  label: "Paperclip · Halonic",
  address: "https://paperclip.acme.test",
  state: { kind: "online", asOf: "2026-11-24T13:59:00.000Z" },
};

async function started(fake: FakeAgentConnections): Promise<SignInChallenge> {
  const start = await fake.signIn({ address: "https://paperclip.acme.test" });
  if (start.outcome !== "started") throw new Error("The sign-in didn't start");
  return start.challenge;
}

verifies("services.agent-connections", () => {
  it("is one key, the same from the package's entry point, with the fake beside it", () => {
    expect(fromIndex).toBe(AgentConnectionsService);
    expect(AgentConnectionsService.name).toBe("agent-connections");
    expect(fakeFromIndex).toBe(FakeAgentConnections);
  });

  it("gives a sign-in the fake's phrase and 10 minutes", async () => {
    const fake = new FakeAgentConnections({
      phrase: "amber falcon river seven",
      now: () => startedAt,
    });
    const challenge = await started(fake);
    expect(challenge.phrase).toBe("amber falcon river seven");
    expect(challenge.expiresAt).toBe("2026-11-24T14:10:00.000Z");
    expect(challenge.approvalUrl.startsWith("https://paperclip.acme.test/")).toBe(true);
    expect(fake.signIns).toEqual([{ address: "https://paperclip.acme.test" }]);
  });

  it("counts one cancel and ends the sign-in as cancelled", async () => {
    const fake = new FakeAgentConnections();
    const challenge = await started(fake);
    await challenge.cancel();
    await challenge.cancel();
    expect(fake.cancels).toBe(1);
    expect(fake.waiting).toBe(false);
    expect(await challenge.result).toEqual({ outcome: "cancelled" });
  });

  it("throws on cancel when told to, and keeps the sign-in waiting", async () => {
    const fake = new FakeAgentConnections({ cancelFails: true });
    const challenge = await started(fake);
    await expect(challenge.cancel()).rejects.toThrow("The fake engine didn't answer.");
    expect(fake.cancels).toBe(1);
    expect(fake.waiting).toBe(true);
  });

  it("connects only once the test approves, and lists the new connection", async () => {
    const fake = new FakeAgentConnections({ now: () => startedAt });
    const challenge = await started(fake);
    expect(fake.waiting).toBe(true);
    const heard: string[] = [];
    fake.subscribe(() => heard.push("changed"));
    fake.approve("Paperclip · Halonic");
    const result = await challenge.result;
    expect(result.outcome).toBe("connected");
    expect((await fake.list()).map((connection) => connection.label)).toEqual([
      "Paperclip · Halonic",
    ]);
    expect(heard).toEqual(["changed"]);
  });

  it("signs a connection in again under its own ID, and revokes on Disconnect by default", async () => {
    const fake = new FakeAgentConnections({ connections: [halonic] });
    expect(() => fake.approve()).toThrow("No sign-in waits for approval");
    const again = await fake.signIn({
      address: "https://paperclip.acme.test",
      connection: "paperclip:halonic",
    });
    if (again.outcome !== "started") throw new Error("The sign-in didn't start");
    fake.approve();
    const result = await again.challenge.result;
    expect(result.outcome === "connected" && result.connection.id).toBe("paperclip:halonic");
    expect(result.outcome === "connected" && result.connection.label).toBe("Paperclip · Halonic");
    expect(await fake.list()).toHaveLength(1);
    expect(await fake.disconnect("paperclip:halonic")).toEqual({ revoked: true });
  });

  it("ends a sign-in as refused or expired when the test says so", async () => {
    const fake = new FakeAgentConnections();
    const refused = await started(fake);
    fake.refuse("other-company");
    expect(await refused.result).toEqual({ outcome: "refused", reason: "other-company" });
    const named = await started(fake);
    fake.refuse("other-company", "Acme");
    expect(await named.result).toEqual({
      outcome: "refused",
      reason: "other-company",
      company: "Acme",
    });
    const expired = await started(fake);
    fake.expire();
    expect(await expired.result).toEqual({ outcome: "expired" });
    const notSaved = await started(fake);
    fake.failKeychain();
    expect(await notSaved.result).toEqual({ outcome: "key-not-saved" });
  });

  it("refuses to start when told to", async () => {
    const fake = new FakeAgentConnections({ refuseStart: "address-not-allowed" });
    expect(await fake.signIn({ address: "https://elsewhere.test" })).toEqual({
      outcome: "refused",
      reason: "address-not-allowed",
    });
  });

  it("removes a disconnected connection, and says when its key stays valid", async () => {
    const fake = new FakeAgentConnections({
      connections: [halonic],
      disconnect: { revoked: false, validUntil: "2026-12-24T14:00:00.000Z" },
    });
    expect(await fake.disconnect(halonic.id)).toEqual({
      revoked: false,
      validUntil: "2026-12-24T14:00:00.000Z",
    });
    expect(fake.disconnects).toEqual([halonic.id]);
    expect(await fake.list()).toEqual([]);
  });
});
