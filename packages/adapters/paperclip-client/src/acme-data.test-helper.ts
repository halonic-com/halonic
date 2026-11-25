/** A made-up key. Tests search errors and logs for it. */
export const testKey = "made-up-made-up-made-up";

export const company = "c0000000-0000-4000-8000-000000000001";
export const agentAda = "a0000000-0000-4000-8000-000000000001";
export const agentBo = "a0000000-0000-4000-8000-000000000002";
export const chatTask = "i0000000-0000-4000-8000-000000000001";
export const plainTask = "i0000000-0000-4000-8000-000000000002";
export const confirmCard = "f0000000-0000-4000-8000-000000000001";
export const questionCard = "f0000000-0000-4000-8000-000000000002";
export const approvalId = "p0000000-0000-4000-8000-000000000001";
export const me = "u-acme-board";
export const websiteProject = "r0000000-0000-4000-8000-000000000001";

/** Acme's two agents and its chat with Ada. */
function acmeAgentsAndChats() {
  return {
    agents: [
      { id: agentAda, name: "Ada", title: "CTO", status: "running" },
      { id: agentBo, name: "Bo", title: null, status: "paused" },
    ],
    chats: [
      {
        id: chatTask,
        title: "Chat with Ada",
        conversationAgentId: agentAda,
        conversationState: "waiting",
        updatedAt: "2026-11-24T10:05:00.000Z",
      },
    ],
    comments: [
      {
        id: "m2",
        body: "Shall I go on?",
        authorAgentId: agentAda,
        createdAt: "2026-11-24T10:02:00.000Z",
      },
      { id: "m1", body: "Hello Ada", authorUserId: me, createdAt: "2026-11-24T10:01:00.000Z" },
      {
        id: "m0",
        body: "gone",
        authorUserId: me,
        deletedAt: "2026-11-24T10:00:30.000Z",
        createdAt: "2026-11-24T10:00:00.000Z",
      },
    ],
  };
}

/** Acme's open tasks: a plain one and the chat's. */
function acmeTasks() {
  return [
    {
      id: plainTask,
      identifier: "ACME-7",
      projectId: websiteProject,
      title: "Pick a launch date",
      status: "in_review",
      assigneeAgentId: agentBo,
      updatedAt: "2026-11-24T10:00:00.000Z",
    },
    {
      id: chatTask,
      identifier: "ACME-8",
      title: "Chat with Ada",
      status: "in_progress",
      assigneeAgentId: agentAda,
      updatedAt: "2026-11-24T09:00:00.000Z",
    },
  ];
}

/** The plain task's cards: a confirmation and a question for the board, and one addressed to an agent. */
function acmeCards() {
  const question = {
    id: "q1",
    prompt: "Which colour?",
    selectionMode: "single",
    options: [{ id: "red", label: "Red" }],
  };
  return [
    {
      id: confirmCard,
      kind: "request_confirmation",
      status: "pending",
      createdByAgentId: agentBo,
      payload: { version: 1, prompt: "Launch on Friday?", acceptLabel: "Yes, Friday" },
      createdAt: "2026-11-24T10:00:00.000Z",
    },
    {
      id: questionCard,
      kind: "ask_user_questions",
      status: "pending",
      createdByAgentId: agentBo,
      payload: { version: 1, questions: [question] },
      createdAt: "2026-11-24T09:59:00.000Z",
    },
    {
      id: "f-agent-only",
      kind: "request_confirmation",
      status: "pending",
      addresseeAgentId: agentAda,
      payload: { version: 1, prompt: "For Ada only" },
      createdAt: "2026-11-24T09:58:00.000Z",
    },
  ];
}

/** An invented Acme company: two agents, a chat, a plain task with two cards, one approval. */
export function acmeData() {
  return {
    projects: [{ id: websiteProject, name: "Website" }],
    ...acmeAgentsAndChats(),
    tasks: acmeTasks(),
    cards: acmeCards(),
    approvals: [
      {
        id: approvalId,
        type: "hire_agent",
        status: "pending",
        requestedByAgentId: agentAda,
        payload: { title: "Hire a designer", summary: "One more seat" },
        createdAt: "2026-11-24T09:30:00.000Z",
      },
    ],
    // Standalone decisions; Acme has none open unless a test adds one.
    decisions: [] as { status: string }[],
  };
}
