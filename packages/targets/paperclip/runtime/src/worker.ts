import { builtInSnapshot } from "./built-in.ts";
import { runtimeHandlers } from "./handlers.ts";
import { registerWorkspaceTools } from "./register.ts";
import { startWorker } from "./worker-client.ts";

/**
 * The plugin worker, built into the `worker.js` the plugin builder copies
 * into every plugin. Paperclip starts it with Node and speaks to it over
 * stdin and stdout. Those two pipes, reached through the `process` global,
 * are all of Node it touches: it imports no `node:*` module and no Paperclip
 * code, only the `snapshot.json` next to it, as a JSON module.
 */

/** Reads `snapshot.json` next to the built `worker.js`; the builder writes it there. */
async function readJson(): Promise<unknown> {
  const module = await import("./snapshot.json", { with: { type: "json" } });
  return module.default;
}

const { snapshot } = await builtInSnapshot(readJson);

const worker = startWorker(
  { input: process.stdin, write: (line) => process.stdout.write(line) },
  (host, start) =>
    registerWorkspaceTools(host, {
      declarations: start.tools,
      builtIn: snapshot,
      handlers: runtimeHandlers,
    }),
);

await worker.done;
process.exit(0);
