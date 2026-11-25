import { agentMessagingContract, FakeAgentMessaging } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import {
  callMessaging,
  errorCode,
  messagingServer,
  RouteAgentMessaging,
  signedIn,
} from "./messaging-client.test-helper.ts";
import { testServer } from "./test-server.ts";

const canary = "canary-message-body-5f1c";

agentMessagingContract("the server's messaging routes", async (fake) => {
  const { server } = messagingServer(fake);
  return new RouteAgentMessaging(server, await signedIn(server));
});

/** A fake with one conversation, and a provider whose `send` fails with the message's text in its error. */
function failingSend() {
  const fake = new FakeAgentMessaging();
  const source = fake.addSource({ label: "Paperclip · Acme" });
  const chat = fake.addConversation(fake.addAgent(source.id, { name: "Chief" }).id);
  fake.send = async (_conversation, body) => {
    const failure = new Error(`Paperclip refused the comment "${body}"`, { cause: { body } });
    throw Object.assign(failure, { headers: { authorization: `Bearer ${body}` } });
  };
  return { fake, chat };
}

/** Everything a log entry or an error holds, as text a test can search. */
function logText(entries: readonly unknown[]): string {
  return entries
    .map((entry) =>
      entry instanceof Error
        ? `${entry.name} ${entry.message} ${entry.stack} ${JSON.stringify(entry.cause)} ${JSON.stringify(entry)}`
        : JSON.stringify(entry),
    )
    .join("\n");
}

verifies("server.messaging-routes", () => {
  describe("logs", () => {
    it("keeps a message's text out of the request and error logs when the provider fails", async () => {
      const { fake, chat } = failingSend();
      const { server, requestLog, errors } = messagingServer(fake);
      const session = await signedIn(server);

      const response = await callMessaging(server, "POST", "send", {
        headers: session,
        body: { conversation: chat.id, body: `Ship it ${canary}` },
      });

      expect(response.status).toBe(502);
      expect(await errorCode(response)).toBe("messaging_failed");
      expect(requestLog).toContainEqual({
        method: "POST",
        path: "/api/messaging/send",
        status: 502,
      });
      expect(errors).toHaveLength(1);
      expect(logText([...requestLog, ...errors])).not.toContain(canary);
      expect(logText([...requestLog, ...errors])).not.toContain(chat.id);
    });

    it("logs a sent message by method, path and status only", async () => {
      const fake = new FakeAgentMessaging();
      const source = fake.addSource({ label: "Paperclip · Acme" });
      const chat = fake.addConversation(fake.addAgent(source.id, { name: "Chief" }).id);
      const { server, requestLog, errors } = messagingServer(fake);
      const session = await signedIn(server);

      await callMessaging(server, "POST", "send", {
        headers: session,
        body: { conversation: chat.id, body: `Ship it ${canary}` },
      });

      expect(requestLog.at(-1)).toEqual({
        method: "POST",
        path: "/api/messaging/send",
        status: 200,
      });
      expect(errors).toEqual([]);
      expect(logText(requestLog)).not.toContain(canary);
    });
  });

  describe("routes", () => {
    it("refuses a body that doesn't fit, a body that isn't JSON and the wrong method", async () => {
      const { server } = messagingServer(new FakeAgentMessaging());
      const headers = await signedIn(server);

      const extraField = await callMessaging(server, "POST", "send", {
        headers,
        body: { conversation: "c-1", body: "Hi", author: { kind: "agent" } },
      });
      const wrongAnswer = await callMessaging(server, "POST", "answer", {
        headers,
        body: { item: "i-1", answer: { kind: "vote", option: "yes" } },
      });
      const notJson = await callMessaging(server, "POST", "focus", {
        headers: { ...headers, "content-type": "text/plain" },
        body: { inFront: true },
      });
      const wrongMethod = await callMessaging(server, "GET", "send", { headers });
      const unknownCall = await callMessaging(server, "GET", "toString", { headers });

      expect([extraField.status, wrongAnswer.status]).toEqual([400, 400]);
      expect(notJson.status).toBe(415);
      expect([wrongMethod.status, unknownCall.status]).toEqual([404, 404]);
    });

    it("passes a focus report on to the poll loop", async () => {
      const { server, focus } = messagingServer(new FakeAgentMessaging());
      const headers = await signedIn(server);

      const response = await callMessaging(server, "POST", "focus", {
        headers,
        body: { inFront: true },
      });

      expect(response.status).toBe(204);
      expect(focus).toEqual([true]);
    });

    it("answers 404 when the host runs no messaging provider", async () => {
      const server = testServer({ passwordHash: null });

      const response = await callMessaging(server, "GET", "sources");

      expect(response.status).toBe(404);
      expect(await errorCode(response)).toBe("not_found");
    });
  });
});
