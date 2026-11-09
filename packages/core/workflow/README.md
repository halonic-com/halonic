# @halonicjs/workflow

Workflow rules: the statecharts subset, guards, inputs, templates and validation.

- **Layer:** core
- **Owner:** mateo
- **Public API:** `@halonicjs/workflow`

Templates fill `{{path}}` placeholders from a scope (the context and the
current input). A value that is exactly one placeholder keeps its type, so a
number stays a number; placeholders inside a text are written as text.

`toNumber` reads amounts as people and models write them, in English
(`1,200.50`) or European (`1.200,50`) style, with or without a money symbol,
so number guards can compare them.

`parseDuration` reads the delay of a timer transition (`after: 30m`, `4h`,
`2d`) in milliseconds. The approval helpers decide what an `approve` or
`reject` event means for a tool call that waits for a person, and hold the
texts the agent reads when a call is rejected or needs changes.

Each behaviour has a requirement in [`requirements/`](requirements/).

## Example

Templates, amounts, timer delays and approval events. The code lives in
[`examples/templates-numbers-and-approvals.ts`](examples/templates-numbers-and-approvals.ts), where it
is typechecked and run by `src/example.test.ts`; keep this copy in step with it. The file imports
`../src/index.ts`, because a package may not import itself by name; outside this package, import
`@halonicjs/workflow` as below.

```ts
import {
  approvalComment,
  approvalDecision,
  parseDuration,
  render,
  renderText,
  revisedToolResult,
  toNumber,
} from "@halonicjs/workflow";

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
```
