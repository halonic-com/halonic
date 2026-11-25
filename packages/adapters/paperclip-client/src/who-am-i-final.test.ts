import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { chatTask, company, testKey } from "./acme-data.test-helper.ts";
import { PaperclipMessaging } from "./client.ts";
import { type FakeAnswer, FakePaperclip, sourceId, testNow } from "./fake-paperclip.test-helper.ts";

const chat = `${sourceId}:chat:${chatTask}`;
const whoAmIPath = "/api/cli-auth/me";

/** A client with no user, on a fake that answers `whoAmI` with `answers` in turn, the last one after that. */
function clientAnswering(answers: readonly FakeAnswer[]) {
  const paperclip = new FakePaperclip().serveAcme();
  let reads = 0;
  paperclip.on("GET", whoAmIPath, () => {
    reads += 1;
    return answers[Math.min(reads, answers.length) - 1] ?? {};
  });
  const messaging = new PaperclipMessaging({
    address: paperclip.address,
    key: testKey,
    connection: "acme",
    company,
    label: "Paperclip · Acme",
    now: () => testNow,
    fetch: paperclip.fetch,
  });
  return { messaging, whoAmIReads: () => reads };
}

verifies("paperclip-client.who-am-i-final", () => {
  describe("whoAmI", () => {
    it("isn't read again after an answer with no user, such as an agent key's", async () => {
      const { messaging, whoAmIReads } = clientAnswering([{ body: { companyIds: [company] } }]);
      await messaging.listMessages(chat);
      await messaging.listMessages(chat);
      await messaging.send(chat, "On it");
      expect(whoAmIReads()).toBe(1);
    });

    it("isn't read again after a refusal other than 401", async () => {
      const { messaging, whoAmIReads } = clientAnswering([{ status: 403, body: { error: "no" } }]);
      await messaging.listMessages(chat);
      await messaging.listMessages(chat);
      expect(whoAmIReads()).toBe(1);
    });

    it("is read again after a 401 or a 5xx", async () => {
      const { messaging, whoAmIReads } = clientAnswering([
        { status: 401, body: { error: "no" } },
        { status: 503, body: { error: "down" } },
        { body: { companyIds: [company] } },
      ]);
      await messaging.listMessages(chat);
      await messaging.listMessages(chat);
      await messaging.listMessages(chat);
      await messaging.listMessages(chat);
      expect(whoAmIReads()).toBe(3);
    });
  });
});
