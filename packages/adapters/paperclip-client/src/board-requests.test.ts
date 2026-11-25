import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { acmeData, agentAda, agentBo, company, me, plainTask } from "./acme-data.test-helper.ts";
import { secretProposalToItem } from "./board-request-items.ts";
import { connect, FakePaperclip, sourceId as source } from "./fake-paperclip.test-helper.ts";
import { PaperclipIds } from "./ids.ts";

const proposalId = "5e000000-0000-4000-8000-000000000001";
const joinId = "10000000-0000-4000-8000-000000000001";
const proposalItem = `${source}:secret-proposal:${proposalId}`;
const joinItem = `${source}:join-request:${joinId}`;
const proposals = `/api/companies/${company}/secret-proposals`;
const joins = `/api/companies/${company}/join-requests`;
/** A made-up value, planted where a careless mapping would find it. */
const planted = "made-up-planted-value";

/** Ada's proposal of a new Acme secret, from the plain task, as Paperclip's board list has it. */
function proposal(extra: object = {}) {
  return {
    id: proposalId,
    kind: "secret",
    status: "pending",
    proposedName: "Acme deploy token",
    proposedKey: "ACME_DEPLOY_TOKEN",
    proposedDescription: "Deploys the Acme website",
    justification: "The website deploy needs it.",
    valueFingerprintSha256: planted,
    valueLength: 21,
    value: planted,
    valueCiphertext: { sealed: planted },
    proposedByAgentId: agentAda,
    proposedBy: { id: agentAda, name: "Ada" },
    originIssueId: plainTask,
    viewerCanApprove: true,
    approveBlockReason: null,
    createdAt: "2026-11-24T09:40:00.000Z",
    ...extra,
  };
}

/** A person asking to join Acme. */
function joinRequest(extra: object = {}) {
  return {
    id: joinId,
    requestType: "human",
    status: "pending_approval",
    requestingUserId: "u-acme-sam",
    requesterUser: { id: "u-acme-sam", name: "Sam Acme", email: "sam@acme.example" },
    createdAt: "2026-11-24T09:42:00.000Z",
    ...extra,
  };
}

function acmeWith(secretProposals: object[], joinRequests: object[] = []): FakePaperclip {
  const data = acmeData();
  data.secretProposals = secretProposals as typeof data.secretProposals;
  data.joinRequests = joinRequests as typeof data.joinRequests;
  return new FakePaperclip().serveAcme(data);
}

const posts = (paperclip: FakePaperclip) =>
  paperclip.seen.filter((request) => request.method === "POST");

verifies("paperclip-client.board-requests", () => {
  describe("secret proposals and join requests", () => {
    it("lists a secret proposal with its name, key and reason, and Approve and Reject", async () => {
      const paperclip = acmeWith([proposal()]);
      const items = await connect(paperclip, { offline: false }).listInboxItems();
      const item = items.find((each) => each.id === proposalItem);
      expect(item?.question).toContain("New secret: Acme deploy token");
      expect(item?.question).toContain("- Key: ACME_DEPLOY_TOKEN");
      expect(item?.question).toContain("The website deploy needs it.");
      expect(item?.options.map((option) => option.label)).toEqual(["Approve", "Reject"]);
      expect(item?.from).toMatchObject({ kind: "agent", name: "Ada" });
      expect(item?.work).toBe(`${source}:task:${plainTask}`);
      expect(item?.risk).toBe("risky");
      const read = paperclip.seen.find((request) => request.path === proposals);
      expect(read?.query.get("status")).toBe("pending");
      expect(JSON.stringify(items)).not.toContain(planted);
    });

    it("reads no field about a secret's value", () => {
      const read = new Set<string>();
      const watched = new Proxy(proposal(), {
        get(target, name, receiver) {
          if (typeof name === "string") read.add(name);
          return Reflect.get(target, name, receiver);
        },
      });
      const context = { ids: new PaperclipIds("acme"), agentNames: new Map(), userId: me };
      const item = secretProposalToItem(context, watched);
      expect([...read].filter((name) => name.toLowerCase().startsWith("value"))).toEqual([]);
      expect(item).not.toHaveProperty("value");
      expect(JSON.stringify(item)).not.toContain(planted);
    });

    it("shows a binding's agent, secret and setting path", async () => {
      const binding = proposal({
        kind: "binding",
        proposedName: null,
        proposedKey: null,
        secretName: "Acme deploy token",
        target: { id: agentBo, name: "Bo" },
        configPath: "env.ACME_DEPLOY_TOKEN",
      });
      const items = await connect(acmeWith([binding]), { offline: false }).listInboxItems();
      const question = items.find((each) => each.id === proposalItem)?.question;
      expect(question).toContain("Give Bo a secret");
      expect(question).toContain("- Secret: Acme deploy token");
      expect(question).toContain("- Setting: env.ACME_DEPLOY_TOKEN");
    });

    it("offers only Reject when Paperclip says this person can't approve it", async () => {
      const blocked = proposal({
        viewerCanApprove: false,
        approveBlockReason: "Company admin access required",
      });
      const items = await connect(acmeWith([blocked]), { offline: false }).listInboxItems();
      const item = items.find((each) => each.id === proposalItem);
      expect(item?.options.map((option) => option.id)).toEqual(["reject"]);
      expect(item?.question).toContain("Company admin access required. Approve it in Paperclip.");
    });

    it("approves with an empty body, and rejects with the note or a fixed reason", async () => {
      const paperclip = acmeWith([proposal()])
        .on("POST", `${proposals}/${proposalId}/approve`, { body: {} })
        .on("POST", `${proposals}/${proposalId}/reject`, { body: {} });
      const client = connect(paperclip, { offline: false });
      await client.answer(proposalItem, { kind: "option", option: "approve" });
      await client.answer(proposalItem, { kind: "option", option: "reject", note: "Not this one" });
      const result = await client.answer(proposalItem, { kind: "option", option: "reject" });
      expect(result.outcome).toBe("answered");
      expect(posts(paperclip).map((request) => [request.path, request.body])).toEqual([
        [`${proposals}/${proposalId}/approve`, {}],
        [`${proposals}/${proposalId}/reject`, { reason: "Not this one" }],
        [`${proposals}/${proposalId}/reject`, { reason: "Rejected in Halonic." }],
      ]);
    });

    it("says who answered it when Paperclip already resolved it", async () => {
      const approved = proposal({
        status: "approved",
        resolvedByUserId: me,
        resolvedAt: "2026-11-24T09:50:00.000Z",
      });
      const paperclip = acmeWith([approved]).on("POST", `${proposals}/${proposalId}/approve`, {
        status: 409,
        body: { error: "Proposal is no longer pending" },
      });
      const result = await connect(paperclip, { offline: false }).answer(proposalItem, {
        kind: "option",
        option: "approve",
      });
      expect(result).toEqual({
        outcome: "already-answered",
        by: { kind: "me" },
        answeredAt: "2026-11-24T09:50:00.000Z",
      });
    });

    it("lists a person's and an agent's join request, and answers both with an empty body", async () => {
      const agentJoin = joinRequest({
        id: "10000000-0000-4000-8000-000000000002",
        requestType: "agent",
        requestingUserId: null,
        requesterUser: null,
        agentName: "Cy",
        adapterType: "process",
        agentDefaultsPayload: { env: { ACME_TOKEN: planted } },
      });
      const paperclip = acmeWith([], [joinRequest(), agentJoin])
        .on("POST", `${joins}/${joinId}/approve`, { body: {} })
        .on("POST", `${joins}/${joinId}/reject`, { body: {} });
      const client = connect(paperclip, { offline: false });
      const items = await client.listInboxItems();
      const questions = items.flatMap((item) => (item.id.includes(":join-request:") ? [item] : []));
      expect(questions.map((item) => item.question.split("\n")[0])).toEqual([
        "Join request: Sam Acme",
        "Join request: agent Cy",
      ]);
      expect(JSON.stringify(items)).not.toContain(planted);
      await client.answer(joinItem, { kind: "option", option: "approve" });
      await client.answer(joinItem, { kind: "option", option: "reject" });
      expect(posts(paperclip).map((request) => [request.path, request.body])).toEqual([
        [`${joins}/${joinId}/approve`, {}],
        [`${joins}/${joinId}/reject`, {}],
      ]);
    });

    it("keeps the Inbox when Paperclip refuses this person the join requests", async () => {
      const paperclip = acmeWith([proposal()]).on("GET", joins, {
        status: 403,
        body: { error: "Forbidden" },
      });
      const items = await connect(paperclip, { offline: false }).listInboxItems();
      expect(items.some((item) => item.id === proposalItem)).toBe(true);
    });
  });
});
