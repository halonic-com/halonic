import type { AnswerResult, InboxAnswer, InboxItem } from "@halonicjs/ports";
import { serverPairingSecretName } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { afterEach, describe, expect, it, vi } from "vitest";
import { answerDigest } from "./answer-confirmation.ts";
import { acme, type Desktop, startDesktop, testKey } from "./desktop-messaging.test-helper.ts";

let desktop: Desktop | undefined;

afterEach(async () => {
  await desktop?.close();
  desktop = undefined;
});

const answered: AnswerResult = { outcome: "answered", answeredAt: "2026-11-27T10:00:00.000Z" };
const approve: InboxAnswer = { kind: "option", option: "approve" };
const accept: InboxAnswer = { kind: "option", option: "accept" };

/** A risky item of the provider's `kind`, as the Paperclip provider maps it, with Approve and Reject. */
function risky(id: string, question: string, extra: Partial<InboxItem> = {}): InboxItem {
  return {
    id,
    source: "paperclip:halonic",
    from: { kind: "agent", agent: "paperclip:halonic:agent:ada", name: "Ada" },
    question,
    options: [
      { id: "approve", label: "Approve" },
      { id: "reject", label: "Reject" },
    ],
    kind: "approval",
    risk: "risky",
    attachments: [],
    createdAt: "2026-11-27T09:00:00.000Z",
    state: { kind: "open" },
    ...extra,
  };
}

/** Every kind of item the Paperclip provider marks risky, and the answer that approves it. */
const riskyKinds: readonly (readonly [string, InboxItem, InboxAnswer])[] = [
  [
    "a new secret's proposal",
    risky("p-new", "New secret: Acme deploy token", {
      reach: { agent: "Ada", secret: { name: "Acme deploy token" } },
    }),
    approve,
  ],
  [
    "a secret binding's proposal",
    risky("p-bind", "Give Bo access to a secret", {
      reach: {
        agent: "Bo",
        secret: { name: "Acme deploy token", settingPath: "env.ACME_DEPLOY_TOKEN" },
      },
    }),
    approve,
  ],
  [
    "a hire",
    risky("hire", "Hire an agent", {
      reach: {
        agent: "Iris",
        adapter: "process",
        env: [{ name: "ACME_DEPLOY_TOKEN", bindsSecret: true }],
      },
    }),
    approve,
  ],
  [
    "an approval of a type nobody knows",
    risky("unknown", "Approve grant_agent_permissions"),
    approve,
  ],
  [
    "an agent's join request",
    risky("join", "Join request: agent Cy", { reach: { agent: "Cy", adapter: "process" } }),
    approve,
  ],
  ["a budget override", risky("budget", "Raise a budget"), { ...approve, note: "200" }],
  ["the CEO's strategy", risky("strategy", "Approve the CEO's strategy"), approve],
  [
    "a confirmation that runs a tool",
    risky("tool", "Send the launch mail?", {
      kind: "question",
      options: [
        { id: "accept", label: "Yes" },
        { id: "reject", label: "No" },
      ],
    }),
    accept,
  ],
];

/** The page's answer route, or the shell's confirmed one. */
type AnswerRoute = "POST /v1/messaging/answer" | "POST /v1/messaging/answer-confirmed";

/** The desktop with its workspace listing `items`, its `answer` a spy. */
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

verifies("agent-host.risky-answer-confirm", () => {
  describe("the page's answer", () => {
    for (const [name, item, answer] of riskyKinds) {
      it(`refuses to approve ${name} without the shell's yes, sending nothing`, async () => {
        const on = await listing([item]);

        const reply = await on.send("POST /v1/messaging/answer", item.id, answer);

        expect(reply).toMatchObject({
          status: 409,
          body: {
            error: { kind: "needs_confirmation" },
            confirmation: {
              title: item.question,
              from: "Ada",
              option: item.options.find(
                (option) => option.id === (answer as { option: string }).option,
              )?.label,
              digest: answerDigest(item, answer),
              ...(item.reach === undefined ? {} : { reach: item.reach }),
            },
          },
        });
        expect(on.answer).not.toHaveBeenCalled();
      });
    }

    it("sends a reject, and any answer to a normal item, at once", async () => {
      const normal: InboxItem = { ...risky("normal", "Publish the launch post?"), risk: "normal" };
      const hire = riskyKinds[2]?.[1] ?? normal;
      const on = await listing([hire, normal]);
      const reject: InboxAnswer = { kind: "option", option: "reject", note: "Not now" };

      for (const [item, answer] of [
        [hire, reject],
        [hire, { kind: "option", option: "request-changes", note: "Fewer variables" }],
        [normal, approve],
      ] as const) {
        const reply = await on.send("POST /v1/messaging/answer", item.id, answer);
        expect(reply).toEqual({ status: 200, body: { result: answered } });
      }
      expect(on.answer).toHaveBeenCalledTimes(3);
    });

    it("needs the yes for a reply or another answer to a risky item, and for a risk it doesn't know", async () => {
      const odd = { ...risky("odd", "Something new"), risk: "unheard-of" } as unknown as InboxItem;
      const hire = riskyKinds[2]?.[1] ?? odd;
      const on = await listing([hire, odd]);

      for (const [item, answer] of [
        [hire, { kind: "reply", text: "Go ahead" }],
        [odd, approve],
      ] as const) {
        const reply = await on.send("POST /v1/messaging/answer", item.id, answer);
        expect(reply).toMatchObject({
          status: 409,
          body: { error: { kind: "needs_confirmation" } },
        });
      }
      expect(on.answer).not.toHaveBeenCalled();
    });

    it("refuses an item the workspace no longer lists with not-found, unsent", async () => {
      const on = await listing([]);

      const reply = await on.send("POST /v1/messaging/answer", "hire", approve);

      expect(reply).toEqual({
        status: 200,
        body: { result: { outcome: "refused", reason: "not-found" } },
      });
      expect(on.answer).not.toHaveBeenCalled();
    });
  });

  describe("the shell's confirmed answer", () => {
    const hire = riskyKinds[2]?.[1] ?? risky("hire", "Hire an agent");

    it("sends the approve with the digest of the item and the answer the person saw", async () => {
      const on = await listing([hire]);

      const reply = await on.send(
        "POST /v1/messaging/answer-confirmed",
        hire.id,
        approve,
        answerDigest(hire, approve),
      );

      expect(reply).toEqual({ status: 200, body: { result: answered } });
      expect(on.answer).toHaveBeenCalledExactlyOnceWith(hire.id, approve);
    });

    it("refuses an item that changed between the check and the send, sending nothing", async () => {
      const on = await listing([hire]);
      const check = await on.send("POST /v1/messaging/answer", hire.id, approve);
      const { digest } = (check.body as { confirmation: { digest: string } }).confirmation;
      // The agent adds a variable while the dialog is open.
      const changed: InboxItem = {
        ...hire,
        reach: { ...hire.reach, env: [{ name: "ACME_ROOT_TOKEN", bindsSecret: true }] },
      };
      on.list.mockResolvedValue([changed]);

      const reply = await on.send("POST /v1/messaging/answer-confirmed", hire.id, approve, digest);

      expect(reply).toMatchObject({ status: 409, body: { error: { kind: "item_changed" } } });
      expect(on.answer).not.toHaveBeenCalled();
    });

    it("refuses a digest of another answer, or a malformed one, sending nothing", async () => {
      const on = await listing([hire]);
      const other: InboxAnswer = { kind: "reply", text: "Go ahead" };

      const swapped = await on.send(
        "POST /v1/messaging/answer-confirmed",
        hire.id,
        approve,
        answerDigest(hire, other),
      );
      const malformed = await on.send("POST /v1/messaging/answer-confirmed", hire.id, approve, "x");

      expect(swapped).toMatchObject({ status: 409, body: { error: { kind: "item_changed" } } });
      expect(malformed.status).toBe(400);
      expect(on.answer).not.toHaveBeenCalled();
    });
  });

  describe("whichever engine serves the workspace", () => {
    it("on this computer, Paperclip hears nothing of a secret proposal's approve", async () => {
      desktop = await startDesktop();
      const on = desktop;
      on.paperclip.servesInbox = true;
      on.paperclip.secretProposals = [
        {
          id: "5e000000-0000-4000-8000-000000000001",
          kind: "binding",
          status: "pending",
          secretName: "Acme deploy token",
          target: { id: "agent-bo", name: "Bo" },
          configPath: "env.ACME_DEPLOY_TOKEN",
          proposedByAgentId: "agent-ada",
          createdAt: "2026-11-27T09:40:00.000Z",
        },
      ];
      await on.paperclipKey.handOver({
        workspace: on.workspace,
        connection: "halonic",
        key: testKey,
        ...acme,
      });
      const item = (await on.studio.listInboxItems()).find((each) => each.risk === "risky");
      expect(item?.reach).toEqual({
        agent: "Bo",
        secret: { name: "Acme deploy token", settingPath: "env.ACME_DEPLOY_TOKEN" },
      });

      const reply = await on.transport.request("POST /v1/messaging/answer", {
        workspace: on.workspace,
        item: item?.id,
        answer: approve,
      });

      expect(reply).toMatchObject({ status: 409, body: { confirmation: { reach: item?.reach } } });
      expect(on.paperclip.seen.filter((seen) => seen.method === "POST")).toEqual([]);
    });

    it("on a paired server, the server hears nothing of a hire's approve", async () => {
      desktop = await startDesktop();
      const on = desktop;
      const { key } = await on.setting.read(on.workspace);
      await on.keychain.set(serverPairingSecretName(key), on.server.token);
      await on.setting.useServer(on.workspace, on.server.address);
      const hire = riskyKinds[2]?.[1];
      on.server.inboxItems = [{ ...hire, source: "halonic-server:acme" }];
      const [item] = await on.studio.listInboxItems();
      expect(item?.reach).toEqual(hire?.reach);

      const reply = await on.transport.request("POST /v1/messaging/answer", {
        workspace: on.workspace,
        item: item?.id,
        answer: approve,
      });

      expect(reply).toMatchObject({ status: 409, body: { confirmation: { reach: hire?.reach } } });
      const answers = on.server.seen.filter((seen) => seen.url.endsWith("/answer"));
      expect(answers).toEqual([]);
    });
  });
});
