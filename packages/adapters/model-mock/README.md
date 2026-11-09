# @halonicjs/adapter-model-mock

The scripted mock model. It answers each agent from a script, turns `tool:<name> <json>` lines into tool calls, and never touches the network, so `halonic test`, the engine's tests and the parity run give the same event log every time. A workspace can also use it as a provider with `type: mock`.

- **Layer:** adapters
- **Owner:** liam
- **Runtime:** any (Web globals only, no Node APIs)
- **Public API:** `@halonicjs/adapter-model-mock`

## How a script works

- A script maps an agent id to its replies, used in order. The key `*` holds the replies for agents with no script of their own.
- An agent whose own script has run out gets the fallback, not a `*` reply. The default fallback echoes the last user message; the test runner passes one that answers empty text.
- A reply whose every non-blank line is `tool:<name> <arguments>` asks for those tools. Arguments that aren't a JSON object are passed on as `{ input: <text> }`. Call ids count up per model: `mock_call_1`, `mock_call_2` …
- Usage is about four characters a token, rounded up, as in the old mock, so recorded event logs and budget tests keep their numbers.
- `remaining()` gives the replies left per agent, and `requests` keeps every request, so a test can check it used its whole script.

As a workspace provider:

```yaml
# providers/mock.yaml
id: mock
type: mock
options:
  script:
    writer: [Hello]
```

## Example

A scripted agent that calls a tool and then answers. The code lives in
[`examples/scripted-agent.ts`](examples/scripted-agent.ts), where it is typechecked and run by
`src/example.test.ts`; keep this copy in step with it. The file imports `../src/index.ts`, because
a package may not import itself by name; outside this package, import
`@halonicjs/adapter-model-mock` as below.

```ts
import { MockLlmProvider } from "@halonicjs/adapter-model-mock";

/** A scripted agent that first calls a tool and then answers, with no network and the same output every time. */
export async function runExample(): Promise<{
  toolCalls: { id: string; name: string; arguments: Record<string, unknown> }[];
  answer: string;
  left: Record<string, number>;
}> {
  // Each agent gets its replies in order. A `tool:<name> <json>` line calls a tool.
  const model = new MockLlmProvider("mock", {
    support: ['tool:search_handbook {"query":"refund"}', "Refunds take 5 days."],
  });
  const ask = { model: "any", messages: [], meta: { agentId: "support" } };

  const first = await model.chat(ask); // asks for search_handbook, id "mock_call_1"
  const second = await model.chat(ask); // "Refunds take 5 days."

  return {
    toolCalls: first.toolCalls,
    answer: second.content,
    left: model.remaining(), // { support: 0 }: the script was used up
  };
}
```
