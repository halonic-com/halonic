import type { AnswerResult, InboxAnswer, InboxItem } from "@halonicjs/ports";

// Risky items as the Paperclip provider maps them, for the tests of
// `agent-host.risky-answer-confirm`.

/** What the spied `answer` answers. */
export const answered: AnswerResult = {
  outcome: "answered",
  answeredAt: "2026-11-27T10:00:00.000Z",
};
/** Approve. */
export const approve: InboxAnswer = { kind: "option", option: "approve" };
/** Accept. */
export const accept: InboxAnswer = { kind: "option", option: "accept" };

/** A risky item of the provider's `kind`, as the Paperclip provider maps it, with Approve, Reject and Request changes. */
export function risky(id: string, question: string, extra: Partial<InboxItem> = {}): InboxItem {
  return {
    id,
    source: "paperclip:halonic",
    from: { kind: "agent", agent: "paperclip:halonic:agent:ada", name: "Ada" },
    question,
    options: [
      { id: "approve", label: "Approve" },
      { id: "reject", label: "Reject", declines: true },
      { id: "request-changes", label: "Request changes", declines: true },
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
export const riskyKinds: readonly (readonly [string, InboxItem, InboxAnswer])[] = [
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
        { id: "reject", label: "No", declines: true },
      ],
    }),
    accept,
  ],
];

/** The page's answer route, or the shell's confirmed one. */
export type AnswerRoute = "POST /v1/messaging/answer" | "POST /v1/messaging/answer-confirmed";
