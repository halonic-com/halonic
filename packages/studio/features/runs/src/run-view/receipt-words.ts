import { capitalised } from "../run-words.ts";

/** The receipt's heading: kit 24.2 gives it an `h2`; the word is a team decision under HAL-2282 (HAL-1301). */
export const receiptWords = {
  heading: "Receipt",
  approvalsHeading: "Approvals",
  messagesHeading: "Messages",
  readHeading: "Read",
  /** The Messages section's two lines (RCPT-2.2), one for drafts and one for sends. */
  drafted: (things: string) => `Drafted ${things}`,
  sent: (things: string) => `Sent ${things}`,
  modelsHeading: "Models and cost",
  /** One model's line (RCPT-2.5): calls, tokens, then what they cost. */
  modelCalls: (model: string, calls: number) =>
    `${model} · ${calls === 1 ? "1 call" : `${calls} calls`}`,
  modelTokens: (input: number, output: number) =>
    `${input.toLocaleString("en")} in · ${output.toLocaleString("en")} out`,
  modelCached: "cached, no model call",
  /** A mix of cached and fresh calls: "2 cached calls". */
  modelCachedCalls: (calls: number) => `${calls} cached ${calls === 1 ? "call" : "calls"}`,
  /** The line of the calls the built-in test model answered, in place of its model id (HAL-12727). */
  testModel: "Built-in test model",
  /** A call priced 0: never an amount (mc 15.2). */
  modelNoCost: "no cost",
  modelNoPrice: "No price",
  modelSubscription: "on your subscription",
  /** The total under the model lines; `calls` is the calls without a price. */
  modelsTotal: (amount: string, calls: number) =>
    `Estimated cost ${amount}${calls === 0 ? "" : ` + ${calls === 1 ? "1 call" : `${calls} calls`} without a price`} · from the prices in workspace settings › Models`,
  modelsTotalUnpriced: (calls: number) =>
    `${calls === 1 ? "1 call" : `${calls} calls`} without a price · from the prices in workspace settings › Models`,
  /** The Read section's one line (RCPT-2.7). */
  read: (things: string) => `Read ${things}`,
  /** One approval the run asked for: what was decided, by whom (RCPT-2.4), and when. */
  approvalLine: (action: string, decision: "approved" | "rejected", by: string, time: string) =>
    `${capitalised(action)}: ${decision}${by === "" ? "" : ` by ${by}`} at ${time}`,
  /** A wait step's answer (HAL-12727): "approve" and "reject" read as the tool approvals' words. */
  waitAnswerLine: (step: string, event: string, time: string) => {
    if (event === "approve") return `${capitalised(step)}: approved by you at ${time}`;
    if (event === "reject") return `${capitalised(step)}: rejected by you at ${time}`;
    return `${capitalised(step)}: answered ${event} by you at ${time}`;
  },
  approvalWaiting: (action: string) => `${capitalised(action)}: waiting for your answer`,
  /** An approval left open when the run ended: nobody can answer it any more. */
  approvalNotAnswered: (action: string) => `${capitalised(action)}: not answered`,
  approvalByPerson: "you",
  approvalByRule: "a rule",
  itemsHeading: "Items",
  /** The Items section's line for the files a run saved (RCPT-2.1): "Created 1 file: weekly-report.md". */
  createdFiles: (names: readonly string[]) =>
    `Created ${names.length === 1 ? "1 file" : `${names.length} files`}: ${namesInWords(names)}`,
  /** The heading of the agent's own words after the receipt (RCPT-3.4). */
  agentSaysHeading: "What the agent says it did (its own words, not checked)",
};

/** "a.md", or "a.md and b.md", or "a.md, b.md and c.md". */
function namesInWords(names: readonly string[]): string {
  return names.length <= 1
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}
