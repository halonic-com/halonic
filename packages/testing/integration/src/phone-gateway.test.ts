import { openListener } from "@halonicjs/adapter-remote-gateway/testing";
import { GatewayClient, RECONNECT_TO_ANSWER } from "@halonicjs/studio-feature-remote/phone-client";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it } from "vitest";
import { TestPhoneTunnel, until } from "./phone-gateway.test-helper.ts";

type Gateway = Awaited<ReturnType<typeof openListener>>;

const opened: Gateway[] = [];
const clients: GatewayClient[] = [];

afterEach(async () => {
  for (const client of clients.splice(0)) client.dispose();
  for (const gateway of opened.splice(0)) await gateway.stop();
});

/** The real gateway on loopback with one session, and the phone's client paired with it. */
async function phoneAndGateway() {
  const gateway = await openListener();
  opened.push(gateway);
  gateway.source.addSession("s-1");
  gateway.source.emit("s-1", { type: "message", role: "agent", text: "Drafting the report." });
  gateway.source.emit("s-1", {
    type: "approval-requested",
    approval: { id: "a-1", summary: "Send the report by email", risk: "normal" },
  });
  gateway.source.emit("s-1", {
    type: "approval-requested",
    approval: { id: "a-2", summary: "Delete the old reports", risk: "risky" },
  });
  const tunnel = new TestPhoneTunnel(await gateway.pairedClient());
  const client = new GatewayClient(tunnel, "Work laptop");
  clients.push(client);
  return { gateway, tunnel, client };
}

verifies("integration.phone-gateway-interop", () => {
  describe("the phone's gateway client against the real gateway", () => {
    it("lists and watches the session, and shows its events and open approvals", async () => {
      const { client } = await phoneAndGateway();
      const view = await until(client, (next) => (next.sessions[0]?.events.length ?? 0) === 3);
      expect(view.canAnswer).toBe(true);
      expect(view.sessions.map((session) => session.id)).toEqual(["s-1"]);
      expect(view.openApprovals.map((open) => [open.approval.id, open.canAnswer])).toEqual([
        ["a-1", true],
        ["a-2", false],
      ]);
    });

    it("takes events the session adds while the phone watches it", async () => {
      const { gateway, client } = await phoneAndGateway();
      await until(client, (next) => (next.sessions[0]?.events.length ?? 0) === 3);
      gateway.source.emit("s-1", { type: "message", role: "agent", text: "Done." });
      const view = await until(client, (next) => (next.sessions[0]?.events.length ?? 0) === 4);
      expect(view.sessions[0]?.events.at(-1)?.seq).toBe(4);
    });

    it("answers a normal approval and sends a prompt, once each, and the host carries them out", async () => {
      const { gateway, tunnel, client } = await phoneAndGateway();
      await until(client, (next) => next.openApprovals.length === 2);

      expect(await client.answer("s-1", "a-1", "approve")).toEqual({ kind: "done" });
      expect(await client.prompt("s-1", "Add last week's numbers.")).toEqual({ kind: "done" });
      expect(gateway.source.answers).toEqual([{ approvalId: "a-1", decision: "approve" }]);
      expect(gateway.source.prompts).toEqual([
        { sessionId: "s-1", text: "Add last week's numbers." },
      ]);
      const sentTypes = tunnel.sent.map((message) => (message as { type: string }).type);
      expect(sentTypes.filter((type) => type === "answer-approval")).toHaveLength(1);
      expect(sentTypes.filter((type) => type === "prompt")).toHaveLength(1);
    });

    it("never sends an answer to a risky approval", async () => {
      const { gateway, tunnel, client } = await phoneAndGateway();
      await until(client, (next) => next.openApprovals.length === 2);
      expect(await client.answer("s-1", "a-2", "approve")).toEqual({
        kind: "not-sent",
        reason: "off",
      });
      expect(gateway.source.answers).toEqual([]);
      expect(tunnel.sent).not.toContainEqual(expect.objectContaining({ type: "answer-approval" }));
    });

    it("goes stale when the gateway closes, keeping what it showed", async () => {
      const { gateway, client } = await phoneAndGateway();
      await until(client, (next) => (next.sessions[0]?.events.length ?? 0) === 3);
      await gateway.stop();
      opened.splice(0);
      const view = await until(client, (next) => !next.canAnswer);
      expect(view.offReason).toBe(RECONNECT_TO_ANSWER);
      expect(view.sessions[0]?.events).toHaveLength(3);
    });
  });
});
