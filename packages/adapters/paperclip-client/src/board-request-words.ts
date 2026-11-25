/**
 * The words a secret proposal or a join request shows (`paperclip-client.board-requests`), in one
 * place for copy checks. Every name and reason in them is agent- or person-written.
 */
export const boardRequestWords = {
  newSecret: (name: string) => `New secret: ${name}`,
  useSecret: (agent: string) => `Give ${agent} a secret`,
  joinPerson: (who: string) => `Join request: ${who}`,
  joinAgent: (name: string) => `Join request: agent ${name}`,
  someone: "Someone",
  newAgent: "New agent",
  key: "Key",
  description: "Description",
  secret: "Secret",
  setting: "Setting",
  email: "Email",
  adapter: "Adapter",
  capabilities: "Capabilities",
  why: "Why",
  // Halonic never shows or asks for a secret's value; Paperclip keeps it, sealed.
  valueStays: "The value stays sealed in Paperclip; Halonic never reads it.",
  agentJoins: "Approving adds this agent to the company.",
  approveInPaperclip: (reason: string) => `${reason}. Approve it in Paperclip.`,
  approve: "Approve",
  reject: "Reject",
  // Paperclip refuses a rejected secret proposal without a reason; the agent reads it.
  rejectedInHalonic: "Rejected in Halonic.",
} as const;
