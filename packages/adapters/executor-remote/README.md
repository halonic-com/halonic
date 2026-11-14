# @halonicjs/adapter-executor-remote

The `RunExecutor` port against a Halonic host over HTTP, such as `halonic serve` or a Worker. It signs in with the host's password, starts runs, answers and cancels them, runs chat turns, and follows a run through a server-sent event stream that it resumes after a break. It uses `fetch` only, so it runs wherever `fetch` does.

- **Layer:** adapters
- **Owner:** elena
- **Runtime:** any
- **Public API:** `@halonicjs/adapter-executor-remote`

## Example

```ts
import { createRemoteExecutor } from "@halonicjs/adapter-executor-remote";

const executor = createRemoteExecutor({
  baseUrl: "http://127.0.0.1:4173",
  password: "the host's password", // leave out for a host with none
  reportError: (error) => console.error(error),
});

const run = await executor.start({ hubId: "acme", workflowId: "review", input: {} });
executor.subscribe(run.id, 0, {
  onEvent: (event) => console.log(event.seq, event.type),
  onClose: (error) => console.log(error === undefined ? "run ended" : `stream failed: ${error.message}`),
});
executor.connection?.onChange((state) => console.log("engine", state));
```

## What to know

- A broken stream is retried by the executor with the last `seq` it delivered, so `onClose` gets an error only for what retrying can't fix (an unknown run, a refused sign-in, an invalid event). `connection` says `lost` while a stream is down.
- A start that sets `kind`, `trigger`, `harness`, `cantTry` or `version` is refused with a `RangeError`: the host's start routes don't take those fields yet, and dropping them would run something other than what was asked.
- The executor passes the shared `RunExecutor` contract suite against a real served host (`targets/node/runtime`, `remote-executor.test.ts`).
- The requirements are in `requirements/`: `sse`, `session`, `runs`, `stream`.
