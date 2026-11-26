// The code a run's worker starts with (ADR 2.2). It gets nothing but the one
// request over its message port: no env, argv, workerData or host
// functions. It runs the script in the QuickJS isolate with no functions on
// `ctx`, sends the result back as JSON text and is then terminated by the
// parent, which checks that result itself.

import { parentPort } from "node:worker_threads";
import { createQuickJsToolScriptIsolate } from "@halonicjs/adapter-toolscript-quickjs";
import { startedMessage, type WorkerRequest, type WorkerResultMessage } from "./worker-messages.ts";

const port = parentPort;
if (port === null) throw new Error("worker-entry.ts runs only as a worker thread.");

port.once("message", async (request: WorkerRequest) => {
  port.postMessage(startedMessage);
  const result = await createQuickJsToolScriptIsolate({ limits: request.limits }).run({
    runId: request.runId,
    code: request.code,
    input: JSON.parse(request.input),
    functions: {},
    limits: request.limits,
  });
  const message: WorkerResultMessage = { result: JSON.stringify(result) };
  port.postMessage(message);
});
