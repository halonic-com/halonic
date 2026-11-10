# @halonicjs/adapter-integration-runner

The bridge between Halonic and the runner: a separate Node process that holds one local integration inside the fence. Both sides speak a strict message protocol over the runner's stdin and stdout (design HAL-958, section 3).

- **Layer:** adapters
- **Owner:** ravi
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-integration-runner`

This package is built in steps (HAL-983). So far it has the protocol on both sides:

- **Frames:** one JSON frame per line, at most 1 MiB (`maxFrameBytes`) with its newline. Bytes
  travel as base64.
- **Halonic's side, `connectRunner`:** it takes a runner that has already been started, as a `SandboxProcess`. It waits for
  `ready` with this start's nonce (10 seconds, `readyTimeoutMs`), sends `start` with the settings
  and tool names, and returns a `RunnerConnection`: an `IntegrationConnection` with `stopped`, a
  promise that settles with the reason the runner ended. Each request the runner asks for goes through the kit's client for
  this integration, and a body is read one piece per `pull`.
  - Anything outside the protocol stops the runner and is reported through `onBlocked`. A kit
    refusal on the kit's leak list is reported there too.
  - Tool results, tool errors and stderr pass through the kit's secret filter.
- **The limits** (`defaultRunnerLimits`):
  - at most 8 requests in flight;
  - a request's URL, headers and secret placements together at most 32 KiB, each header and
    placement counting 4 bytes more, with at most 100 headers and 16 placements;
  - a request belongs to its call: when the call answers, is cancelled or fails, Halonic aborts
    its kit request, drops its body and frees its slot;
  - the runner is stopped once it leaves more than 8 MiB of its stdin unread;
  - a call is cancelled when its signal aborts or after 5 minutes, and the runner is stopped if it
    hasn't answered 5 seconds later;
  - between calls, a `ping` every 5 seconds that must be answered within 1 second;
  - the runner is stopped after 2 minutes without a call;
  - stderr is cut at 1 MiB per call.
- **The runner's side, `serveRunner`:** it gives the integration `http`, `settings` and `wait`,
  but no `tokens`. `http` sends each request as a frame. A body the kit would refuse is refused
  before it crosses, and so is a request made outside a tool call.

Not done yet: starting the runner through the `Sandbox` port, building the runner into one file,
Node's permission flags and the module hook.

## Example

```ts
import { connectRunner } from "@halonicjs/adapter-integration-runner";

const connection = await connectRunner({
  process, // started through the Sandbox session
  nonce, // fresh for this start
  settings: { baseUrl: "https://api.example.com" },
  tools: ["forecast"],
  http: host.http, // the kit's client for this integration
  secrets, // secretForms(...) of this integration's secrets
  onBlocked: (block) => pauseConnector(block),
});
const text = await connection.callTool("forecast", { city: "Ghent" }, signal);
```
