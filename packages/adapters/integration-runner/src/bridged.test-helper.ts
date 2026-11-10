// Both sides of the bridge in one test: the real runner side with a fake
// integration, the real Halonic side with a fake kit client.

import type { IntegrationHttpClient, IntegrationRequestInit } from "@halonicjs/ports";
import { connectRunner } from "./halonic/connect-runner.ts";
import { bridgeOptions, fakeRunnerProcess, testNonce } from "./pipes.test-helper.ts";
import { type RunnerHost, serveRunner } from "./runner/serve-runner.ts";

/** What the fake integration's one tool does with its host. */
export type Tool = (host: RunnerHost, signal: AbortSignal) => Promise<string>;

/** Both sides of the bridge, with a fake integration whose one tool is `tool`. */
export async function bridged(tool: Tool, kit: IntegrationHttpClient) {
  const fake = fakeRunnerProcess();
  const options = bridgeOptions(fake, { http: kit, tools: ["run"] });
  const serving = serveRunner({
    input: fake.runnerInput,
    output: fake.runnerOutput,
    nonce: testNonce,
    connect: (host) => ({
      callTool: (_name, _args, signal) => tool(host, signal ?? new AbortController().signal),
      close: async () => undefined,
    }),
  });
  const connection = await connectRunner(options);
  const finish = async () => {
    await connection.close();
    await serving;
  };
  /** Calls the tool once, then closes both sides. */
  const run = async () => {
    try {
      return await connection.callTool("run", {});
    } finally {
      await finish();
    }
  };
  return { run, connection, finish, options };
}

/** A kit answer that waits until the request's signal aborts, then fails as `fetch` does. */
export function untilAborted(_url: string, init: IntegrationRequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });
}
