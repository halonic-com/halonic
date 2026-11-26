import type {
  ActionResultStep,
  Conversation,
  InboxActionRequest,
  InboxItem,
  InboxItemOption,
  InboxQuestion,
  InboxStepperRequest,
  Message,
  MessageWork,
  MessagingAgent,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { keptAgent, keptConversation, keptInboxItem, keptMessage } from "./kept-items.ts";

const testKey = "pcp_board_acme-test-key-0000";

// Every fixture sets every field its port type names: `Required<…>` fails the typecheck when the
// port gains a field, so a new field can't be left out of the copy without a test noticing.
// Some fields never come together from a real source (a stepper and an action on one item); the
// copy doesn't care, so one object covers them all.

const option = {
  id: "approve",
  label: "Approve",
  noteRequired: true,
  noteLabel: "Why",
} satisfies Required<InboxItemOption>;

const question = {
  id: "q1",
  prompt: "Which repositories?",
  selection: "multiple",
  options: [option],
  required: true,
  preselected: ["approve"],
} satisfies Required<InboxQuestion>;

const action = {
  definition: "github.add-deploy-key",
  version: 1,
  parameters: { repository: "acme/app" },
  expect: { repository: "acme/app" },
  expires: "2026-11-27T08:00:00.000Z",
} satisfies Required<InboxActionRequest>;

const stepper = {
  format: "halonic.stepper-request/1",
  document: '{"format":"halonic.stepper-request/1"}',
  revision: "3",
  touches: [
    {
      block: 1,
      risk: "admin",
      targets: [{ service: "github", kind: "repository", name: "acme/app" }],
    },
  ],
  changed: false,
} satisfies Required<InboxStepperRequest>;

const step = {
  step: 1,
  outcome: "succeeded",
  status: 201,
  kept: { id: 7 },
  failure: "service-error",
  error: { untrusted: true, text: "Bad credentials" },
  byHand: true,
} satisfies Required<ActionResultStep>;

const item = {
  id: "item-1",
  source: "acme",
  from: { kind: "agent", agent: "agent-1", name: "Ada" },
  question: "Add a deploy key",
  options: [option],
  questions: [question],
  answerElsewhere: { link: "https://paperclip.acme.test/ACME/issues/ACME-7" },
  webLink: { link: "https://paperclip.acme.test/ACME/issues/ACME-7", site: "Paperclip" },
  action,
  stepper,
  project: { id: "project-1", name: "Acme app" },
  attachments: [{ id: "file-1", name: "plan.png", type: "image/png", size: 1024 }],
  work: "work-1",
  conversation: "chat-1",
  risk: "risky",
  createdAt: "2026-11-26T08:00:00.000Z",
  state: {
    kind: "answered",
    by: { kind: "me" },
    answer: { kind: "action-result", outcome: "succeeded", steps: [step] },
    answeredAt: "2026-11-26T09:00:00.000Z",
  },
} satisfies Required<InboxItem>;

const work = {
  agent: "agent-1",
  state: "failed",
  work: "work-1",
  passedTo: "agent-2",
  reason: "The run ran out of budget.",
  since: "2026-11-26T08:00:00.000Z",
} satisfies Required<MessageWork>;

const message = {
  id: "message-1",
  conversation: "chat-1",
  author: { kind: "me" },
  body: "Ship it?",
  attachments: [],
  sentAt: "2026-11-26T08:00:00.000Z",
  to: ["agent-1"],
  work: [work],
  readAt: "2026-11-26T08:01:00.000Z",
  automatic: true,
  fullAnswer: { key: "full-answer", title: "Full answer", markdown: "All of it." },
} satisfies Required<Message>;

const conversation = {
  id: "chat-1",
  source: "acme",
  agent: "agent-1",
  members: ["agent-1", "agent-2"],
  title: "Release",
  updatedAt: "2026-11-26T08:00:00.000Z",
  waitingForMe: true,
  agentWorking: true,
} satisfies Required<Conversation>;

const agent = {
  id: "agent-1",
  source: "acme",
  name: "Ada",
  title: "CTO",
  activity: "working",
  avatar: "avatar-1",
} satisfies Required<MessagingAgent>;

verifies("agent-host.agent-messaging-cache", () => {
  describe("kept items", () => {
    it("keeps every field the port names on an inbox item, down to its answers", () => {
      expect(keptInboxItem(item)).toEqual(item);
    });

    it("keeps every field the port names on a message and its work lines", () => {
      expect(keptMessage(message)).toEqual(message);
    });

    it("keeps every field the port names on a conversation, agentWorking included", () => {
      expect(keptConversation(conversation)).toEqual(conversation);
    });

    it("keeps every field the port names on an agent, avatar included", () => {
      expect(keptAgent(agent)).toEqual(agent);
    });

    it("keeps no other field of a stepper request, its touches or its targets", () => {
      const extra = { key: testKey };
      const leaky = {
        ...item,
        stepper: {
          ...stepper,
          ...extra,
          touches: stepper.touches.map((touch) => ({
            ...touch,
            ...extra,
            targets: touch.targets.map((target) => ({ ...target, ...extra })),
          })),
        },
      };
      expect(JSON.stringify(keptInboxItem(leaky))).not.toContain(testKey);
    });
  });
});
