// A stand-in for worker-entry.ts in the tests: it does what the request's
// `code` says, so the parent's side meets each way a worker can go wrong.

import { parentPort } from "node:worker_threads";
import { startedMessage, type WorkerRequest } from "../worker-messages.ts";

const port = parentPort;
if (port === null) throw new Error("stand-in-worker.spec.ts runs only as a worker thread.");
port.once("message", ({ code: behaviour }: WorkerRequest) => {
  if (behaviour === "never-start") return;
  port.postMessage(startedMessage);
  switch (behaviour) {
    case "block":
      // A native loop that never reaches QuickJS's interrupt check: only terminate() ends it.
      for (;;) {}
    case "crash":
      throw new Error("acme stand-in crashed in acme-internal-frame");
    case "exit":
      process.exit(0);
      break;
    case "malformed":
      port.postMessage({ result: JSON.stringify({ ok: true, output: "acme", log: "not a list" }) });
      break;
    case "oversized":
      port.postMessage({
        result: JSON.stringify({ ok: true, output: "x".repeat(70_000), log: [] }),
      });
      break;
    case "long-message":
      port.postMessage({
        result: JSON.stringify({
          ok: false,
          reason: "toolscript.script-error",
          message: "x".repeat(301),
          log: [],
        }),
      });
      break;
    case "surroundings":
      port.postMessage({
        result: JSON.stringify({
          ok: true,
          output: {
            env: Object.keys(process.env),
            execArgv: process.execArgv,
            argv: process.argv.slice(2),
          },
          log: [],
        }),
      });
      break;
    default:
      port.postMessage("an unknown behaviour");
  }
});
