import type {
  ActionResultAnswer,
  ActionResultStep,
  Attachment,
  Conversation,
  FullAnswer,
  InboxActionRequest,
  InboxAnswer,
  InboxAnswerElsewhere,
  InboxItem,
  InboxItemOption,
  InboxItemState,
  InboxQuestion,
  InboxQuestionAnswer,
  InboxQuestionsAnswer,
  InboxStepperRequest,
  InboxStepperTarget,
  InboxStepperTouch,
  InboxWebLink,
  Message,
  MessageWork,
  MessagingAgent,
  MessagingAuthor,
  MessagingProject,
  UntrustedText,
  WorkItem,
} from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { keptAgent, keptConversation, keptInboxItem, keptMessage, keptWork } from "./kept-items.ts";

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

const target = {
  service: "github",
  kind: "repository",
  name: "acme/app",
} satisfies Required<InboxStepperTarget>;

const touch = {
  block: 1,
  risk: "admin",
  targets: [target],
} satisfies Required<InboxStepperTouch>;

const stepper = {
  format: "halonic.stepper-request/1",
  document: '{"format":"halonic.stepper-request/1"}',
  revision: "3",
  touches: [touch],
  changed: false,
} satisfies Required<InboxStepperRequest>;

const stepError = {
  untrusted: true,
  text: "Bad credentials",
} satisfies Required<UntrustedText>;

const step = {
  step: 1,
  outcome: "succeeded",
  status: 201,
  kept: { id: 7 },
  failure: "service-error",
  error: stepError,
  byHand: true,
} satisfies Required<ActionResultStep>;

const answerElsewhere = {
  link: "https://paperclip.acme.test/ACME/issues/ACME-7",
} satisfies Required<InboxAnswerElsewhere>;

const webLink = {
  link: "https://paperclip.acme.test/ACME/issues/ACME-7",
  site: "Paperclip",
} satisfies Required<InboxWebLink>;

const project = { id: "project-1", name: "Acme app" } satisfies Required<MessagingProject>;

const attachment = {
  id: "file-1",
  name: "plan.png",
  type: "image/png",
  size: 1024,
} satisfies Required<Attachment>;

const me = { kind: "me" } satisfies Required<Extract<MessagingAuthor, { kind: "me" }>>;

const agentAuthor = {
  kind: "agent",
  agent: "agent-1",
  name: "Ada",
} satisfies Required<Extract<MessagingAuthor, { kind: "agent" }>>;

const person = {
  kind: "person",
  name: "Grace",
} satisfies Required<Extract<MessagingAuthor, { kind: "person" }>>;

const actionResult = {
  kind: "action-result",
  outcome: "succeeded",
  steps: [step],
} satisfies Required<ActionResultAnswer>;

const replyAnswer = {
  kind: "reply",
  text: "Not today.",
} satisfies Required<Extract<InboxAnswer, { kind: "reply" }>>;

const optionAnswer = {
  kind: "option",
  option: "approve",
  note: "Looks safe.",
} satisfies Required<Extract<InboxAnswer, { kind: "option" }>>;

const questionAnswer = {
  question: "q1",
  options: ["approve"],
  text: "Only acme/app.",
} satisfies Required<InboxQuestionAnswer>;

const questionsAnswer = {
  kind: "answers",
  answers: [questionAnswer],
} satisfies Required<InboxQuestionsAnswer>;

const answered = {
  kind: "answered",
  by: me,
  answer: actionResult,
  answeredAt: "2026-11-26T09:00:00.000Z",
} satisfies Required<Extract<InboxItemState, { kind: "answered" }>>;

const open = { kind: "open" } satisfies Required<Extract<InboxItemState, { kind: "open" }>>;

const closed = {
  kind: "closed",
  reason: "cancelled",
  closedAt: "2026-11-26T09:00:00.000Z",
  by: person,
} satisfies Required<Extract<InboxItemState, { kind: "closed" }>>;

const item = {
  id: "item-1",
  source: "acme",
  from: agentAuthor,
  question: "Add a deploy key",
  options: [option],
  questions: [question],
  answerElsewhere,
  webLink,
  action,
  stepper,
  project,
  attachments: [attachment],
  work: "work-1",
  conversation: "chat-1",
  kind: "action",
  risk: "risky",
  reach: {
    agent: "Ada",
    secret: { name: "Acme deploy token", settingPath: "env.ACME_DEPLOY_TOKEN" },
    adapter: "process",
    env: [{ name: "ACME_DEPLOY_TOKEN", bindsSecret: true }],
    envLeftOut: 2,
  },
  createdAt: "2026-11-26T08:00:00.000Z",
  state: answered,
} satisfies Required<InboxItem>;

const work = {
  agent: "agent-1",
  state: "failed",
  work: "work-1",
  passedTo: "agent-2",
  reason: "The run ran out of budget.",
  since: "2026-11-26T08:00:00.000Z",
} satisfies Required<MessageWork>;

const fullAnswer = {
  key: "full-answer",
  title: "Full answer",
  markdown: "All of it.",
} satisfies Required<FullAnswer>;

const message = {
  id: "message-1",
  conversation: "chat-1",
  author: me,
  body: "Ship it?",
  attachments: [attachment],
  sentAt: "2026-11-26T08:00:00.000Z",
  to: ["agent-1"],
  work: [work],
  readAt: "2026-11-26T08:01:00.000Z",
  automatic: true,
  plainText: true,
  fullAnswer,
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

const workItem = {
  id: "work-1",
  source: "acme",
  label: "ACME-7",
  title: "Add a deploy key",
  state: "blocked",
  assignee: "agent-1",
  blockedBy: ["work-2"],
  updatedAt: "2026-11-26T08:00:00.000Z",
} satisfies Required<WorkItem>;

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

    it("keeps every field of an option answer, its note included", () => {
      const withOption = { ...item, state: { ...answered, answer: optionAnswer } };
      expect(keptInboxItem(withOption)).toEqual(withOption);
    });

    it("keeps every field of an answers answer, down to each question's text", () => {
      const withAnswers = { ...item, state: { ...answered, answer: questionsAnswer } };
      expect(keptInboxItem(withAnswers)).toEqual(withAnswers);
    });

    it("keeps every field of a reply answer", () => {
      const withReply = { ...item, state: { ...answered, answer: replyAnswer } };
      expect(keptInboxItem(withReply)).toEqual(withReply);
    });

    it("keeps an open item's state", () => {
      const openItem = { ...item, state: open };
      expect(keptInboxItem(openItem)).toEqual(openItem);
    });

    it("keeps every field of a closed item's state, and none it doesn't have", () => {
      const closedItem = { ...item, state: closed };
      expect(keptInboxItem(closedItem)).toEqual(closedItem);
      const { by: _by, ...nobody } = closed;
      const expiredItem = { ...item, state: { ...nobody, reason: "expired" as const } };
      expect(keptInboxItem(expiredItem)).toEqual(expiredItem);
    });

    it("keeps every field of a person author, on an item, its answer and a message", () => {
      const fromPerson = { ...item, from: person, state: { ...answered, by: person } };
      expect(keptInboxItem(fromPerson)).toEqual(fromPerson);
      const byPerson = { ...message, author: person };
      expect(keptMessage(byPerson)).toEqual(byPerson);
    });

    it("keeps every field the port names on a work item, assignee included", () => {
      expect(keptWork(workItem)).toEqual(workItem);
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

    it("keeps no other field of a reach, its secret or its variables", () => {
      const extra = { value: testKey };
      const { reach } = item;
      const leaky = {
        ...item,
        reach: {
          ...reach,
          ...extra,
          secret: { ...reach.secret, ...extra },
          env: reach.env.map((variable) => ({ ...variable, ...extra })),
        },
      };
      expect(keptInboxItem(leaky)).toEqual(item);
      const { settingPath: _, ...nameOnly } = reach.secret;
      const bare = { ...item, reach: { secret: nameOnly } };
      expect(keptInboxItem(bare)).toEqual(bare);
    });

    it("keeps no other field of a stepper request, its touches or its targets", () => {
      const extra = { key: testKey };
      const leaky = {
        ...item,
        stepper: {
          ...stepper,
          ...extra,
          touches: stepper.touches.map((eachTouch) => ({
            ...eachTouch,
            ...extra,
            targets: eachTouch.targets.map((eachTarget) => ({ ...eachTarget, ...extra })),
          })),
        },
      };
      expect(JSON.stringify(keptInboxItem(leaky))).not.toContain(testKey);
    });
  });
});
