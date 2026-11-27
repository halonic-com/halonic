import type { InboxAnswer, InboxItem } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { answerDigest } from "./answer-confirmation.ts";
import { acme, type Desktop, startDesktop, testKey } from "./desktop-messaging.test-helper.ts";
import { type AnswerRoute, answered, approve, risky } from "./risky-answer.test-helper.ts";

let desktop: Desktop | undefined;

afterEach(async () => {
  await desktop?.close();
  desktop = undefined;
});

/** The desktop with its workspace listing `items`, its `answer` a spy, closed after the test. */
async function listing(items: readonly InboxItem[]) {
  const started = await startDesktop();
  desktop = started;
  const workspace = await started.messaging.of(started.workspace);
  if (workspace === undefined) throw new Error("The helper's workspace isn't served.");
  const list = vi.spyOn(workspace.messaging, "listInboxItems").mockResolvedValue(items);
  const answer = vi.spyOn(workspace.messaging, "answer").mockResolvedValue(answered);
  // The page names only its own answer route; the confirmed one is the shell's.
  const send = (route: AnswerRoute, item: string, sent: InboxAnswer, digest?: string) => {
    const body = {
      workspace: started.workspace,
      item,
      answer: sent,
      ...(digest === undefined ? {} : { digest }),
    };
    return route === "POST /v1/messaging/answer"
      ? started.transport.request(route, body)
      : started.shell(route, body);
  };
  return { list, answer, send };
}

/** A secret proposal to give Bo the secret `secretName`, as Paperclip lists it. */
function proposal(secretName: string, updatedAt: string) {
  return {
    id: "5e000000-0000-4000-8000-000000000001",
    kind: "binding",
    status: "pending",
    secretName,
    target: { id: "agent-bo", name: "Bo" },
    configPath: "env.ACME_DEPLOY_TOKEN",
    proposedByAgentId: "agent-ada",
    createdAt: "2026-11-27T09:40:00.000Z",
    updatedAt,
  };
}

verifies("agent-host.risky-answer-confirm", () => {
  describe("what the shell is asked to confirm", () => {
    it("needs the yes for a decision's option an agent named reject, sending nothing", async () => {
      const decision = risky("decision", "Clean up the launch tasks?", {
        kind: "question",
        options: [
          { id: "reject", label: "Cancel the task tree" },
          { id: "request-changes", label: "Keep them" },
        ],
      });
      const on = await listing([decision]);

      for (const option of ["reject", "request-changes"]) {
        const reply = await on.send("POST /v1/messaging/answer", decision.id, {
          kind: "option",
          option,
        });
        expect(reply).toMatchObject({
          status: 409,
          body: { error: { kind: "needs_confirmation" } },
        });
      }
      expect(on.answer).not.toHaveBeenCalled();
    });

    it("refuses an option the risky item doesn't offer with bad-answer, before asking", async () => {
      const hire = risky("hire", "Hire an agent");
      const on = await listing([hire]);
      const made: InboxAnswer = { kind: "option", option: "Approve: nothing else happens" };

      const reply = await on.send("POST /v1/messaging/answer", hire.id, made);
      const confirmed = await on.send(
        "POST /v1/messaging/answer-confirmed",
        hire.id,
        made,
        answerDigest(hire, made),
      );

      const badAnswer = {
        status: 200,
        body: { result: { outcome: "refused", reason: "bad-answer" } },
      };
      expect(reply).toEqual(badAnswer);
      expect(confirmed).toEqual(badAnswer);
      expect(on.answer).not.toHaveBeenCalled();
    });

    it("shows a budget override's new limit under the option's own label", async () => {
      const budget = risky("budget", "Raise a budget", {
        options: [
          {
            id: "approve",
            label: "Approve",
            noteRequired: true,
            noteLabel: "New limit, in dollars",
          },
          { id: "reject", label: "Reject", declines: true },
        ],
      });
      const on = await listing([budget]);
      const raise: InboxAnswer = { kind: "option", option: "approve", note: "21474836.47\n" };

      const reply = await on.send("POST /v1/messaging/answer", budget.id, raise);

      expect(reply).toMatchObject({
        status: 409,
        body: {
          confirmation: {
            option: "Approve",
            note: { label: "New limit, in dollars", text: "21474836.47" },
            digest: answerDigest(budget, raise),
          },
        },
      });
      expect(on.answer).not.toHaveBeenCalled();
    });

    it("drops format characters and cuts a long line between code points", async () => {
      const long = `${"A".repeat(198)}🚀🚀`;
      const hire = risky("hire", `Hire\u202E\u200B Iris\n${long}`, {
        from: { kind: "agent", agent: "paperclip:halonic:agent:ada", name: long },
      });
      const on = await listing([hire]);

      const reply = await on.send("POST /v1/messaging/answer", hire.id, approve);

      expect(reply).toMatchObject({
        status: 409,
        body: { confirmation: { title: "Hire Iris", from: `${"A".repeat(198)}…` } },
      });
    });
  });

  describe("the source's own copy", () => {
    it("reads Paperclip again before a confirmed send, so a changed proposal isn't sent", async () => {
      desktop = await startDesktop();
      const on = desktop;
      on.paperclip.servesInbox = true;
      on.paperclip.secretProposals = [proposal("Acme deploy token", "2026-11-27T09:40:00.000Z")];
      await on.paperclipKey.handOver({
        workspace: on.workspace,
        connection: "halonic",
        key: testKey,
        ...acme,
      });
      // The first sync fills the local copy, which every later read answers from.
      await on.wait(30_000);
      const item = (await on.studio.listInboxItems()).find((each) => each.risk === "risky");
      const check = await on.transport.request("POST /v1/messaging/answer", {
        workspace: on.workspace,
        item: item?.id,
        answer: approve,
      });
      const { digest } = (check.body as { confirmation: { digest: string } }).confirmation;
      // The agent resubmits it for another secret while the dialog is open; no poll runs.
      on.paperclip.secretProposals = [proposal("Acme root token", "2026-11-27T09:45:00.000Z")];

      const reply = await on.shell("POST /v1/messaging/answer-confirmed", {
        workspace: on.workspace,
        item: item?.id,
        answer: approve,
        digest,
      });

      expect(reply).toMatchObject({ status: 409, body: { error: { kind: "item_changed" } } });
      expect(on.paperclip.seen.filter((seen) => seen.method === "POST")).toEqual([]);
      const again = await on.transport.request("POST /v1/messaging/answer", {
        workspace: on.workspace,
        item: item?.id,
        answer: approve,
      });
      expect(again).toMatchObject({
        status: 409,
        body: { confirmation: { reach: { secret: { name: "Acme root token" } } } },
      });
    });
  });
});
