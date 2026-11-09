import {
  approvalComment,
  approvalDecision,
  parseDuration,
  render,
  renderText,
  revisedToolResult,
  toNumber,
} from "../src/index.ts";

/** Fills templates, reads amounts and delays, and decides what an approval event means. */
export function runExample(): {
  typed: unknown;
  mixed: unknown;
  text: string;
  english: number | null;
  european: number | null;
  notANumber: number | null;
  delayMs: number | null;
  approved: boolean | null;
  notAnApproval: boolean | null;
  toolResult: string;
} {
  // Templates fill `{{path}}` placeholders from a scope.
  const scope = { input: { n: 3, name: "Ada" } };
  const typed = render("{{input.n}}", scope); // 3: a lone placeholder keeps its type
  const mixed = render("Hi {{input.name}}, {{input.n}}!", scope); // "Hi Ada, 3!"
  const text = renderText("{{input.n}}", scope); // "3": always text

  // `toNumber` reads amounts as people write them, and gives `null` when it cannot.
  const english = toNumber("$1,200.50"); // 1200.5
  const european = toNumber("EUR 1.250,00"); // 1250
  const notANumber = toNumber("n/a"); // null

  // `parseDuration` reads the delay of a timer transition (`after: 30m`) in milliseconds.
  const delayMs = parseDuration("30m"); // 1_800_000

  // A run waiting for a person's OK gets the event "approve" or "reject". A "reject" may carry a
  // comment that asks for changes, which the agent then reads.
  const approved = approvalDecision("approve"); // true
  const notAnApproval = approvalDecision("done"); // null
  const comment = approvalComment({ comment: " Use the formal tone. " }); // "Use the formal tone."
  const toolResult = revisedToolResult(comment ?? "");

  return {
    typed,
    mixed,
    text,
    english,
    european,
    notANumber,
    delayMs,
    approved,
    notAnApproval,
    toolResult,
  };
}
